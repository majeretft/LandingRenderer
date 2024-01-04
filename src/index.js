import path from "path";
import fs from "fs";
import { JSDOM } from "jsdom";
import { createParser } from "css-selector-parser";

import cfg from "../config.js";

const parse = createParser();
const tplPath = path.resolve(cfg.templatePath);
const dataPaths = cfg.dataPaths.map((p) => path.resolve(p));

const parsedFiles = dataPaths.map((filePath) => {
  console.log(`Parsing ${filePath}`);

  const data = fs.readFileSync(filePath, "utf8");
  const structure = data
    .replace(/\r/g, "")
    .split("\n")
    .map((x) => x.trim())
    .filter((x) => x.length > 0 && x.startsWith("#") == false);

  const parsedData = {
    filePath,
    structure: [],
  };

  let currentMarker;
  let currentElement;
  for (let str of structure) {
    if (str.startsWith(">>>")) {
      const newMarker = str.replace(">>>", "").trim();
      currentMarker = {
        id: newMarker,
        selector: `template[data-tpl="${newMarker}"]`,
        elements: [],
      };

      parsedData.structure.push(currentMarker);
    } else if (str.startsWith(">")) {
      const currentSelector = str.replace(">", "").trim();

      const astSelector = parse(currentSelector);
      const tagName = astSelector.rules[0].items.find(
        (x) => x.type == "TagName"
      )?.name;
      const tagId = astSelector.rules[0].items.find(
        (x) => x.type == "Id"
      )?.name;
      const tagClasses = astSelector.rules[0].items
        .filter((x) => x.type == "ClassName")
        .map((x) => x.name);

      currentElement = {
        tag: tagName,
        id: tagId,
        classes: tagClasses,
      };
      if (tagName != "img") currentElement.innerText = "";
      currentMarker.elements.push(currentElement);
    } else {
      switch (currentElement.tag) {
        case "img":
          if (/\.(gif|jpe?g|tiff?|png|webp|bmp|svg)$/i.test(str))
            currentElement.src = str;
          else currentElement.alt = str;
          break;
        default:
          currentElement.innerText += str;
          break;
      }
      currentElement.innerText;
    }
  }

  console.log(`Success parsing ${filePath}`);
  return parsedData;
});

for (let parsedFile of parsedFiles) {
  const dom = await JSDOM.fromFile(tplPath);

  for (let marker of parsedFile.structure) {
    const curMarker = dom.window.document.querySelector(marker.selector);

    for (let element of marker.elements) {
      let newEl;
      if (element.tag == "text") {
        newEl = dom.window.document.createTextNode(element.innerText);
      } else {
        newEl = dom.window.document.createElement(element.tag);
        
        if (element.id)
          newEl.id = element.id;

        for (let className of element.classes)
          newEl.classList.add(className);

        switch (element.tag) {
          case "img":
            newEl.src = element.src;
            newEl.alt = element.alt || "";
            break;
          default:
            newEl.textContent = element.innerText;
            break;
        }
      }

      curMarker.before(newEl);
    }

    curMarker.remove();
  }

  const resultFileName = parsedFile.filePath.replace(/\.\w+$/, cfg.resultExtension);
  const resultText = dom.serialize();

  fs.writeFileSync(resultFileName, resultText, 'utf8');
}
