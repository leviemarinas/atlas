import fs from "node:fs";
import path from "node:path";

const BUILD = String.raw`C:\Users\josrp\OneDrive\Documents\Atlas\client-meetings\2026-08-24-computational-basis-integration\build`;
const sourceSlides = [
  1,2,3,4,58,10,50,20,21,11,22,23,28,29,30,31,6,25,13,36,37,38,39,
  59,49,44,45,48,46,47,47,53,53,53,53,53,17,47,47,50,51,59,53,60,
];
const roles = [
  "opening","agenda","overall lifecycle","location","plain-language concepts","workspace","computation register",
  "register field guide 1","register field guide 2","computation demo","creation field guide","expression field guide",
  "mapped-field guide","test guide","change-details guide","record-and-action guide","governance boundary",
  "assignment demo","assignment register","assignment columns guide 1","assignment columns guide 2",
  "assignment form guide 1","assignment form guide 2","conflict checks","reference sources","reference guide 1",
  "reference guide 2","change history","history field guide","saved versus executed","module dependency matrix",
  "HRM examples","timekeeping examples","payroll setup examples","payroll processing examples","output examples",
  "worked example CUS-900","worked example overtime","worked example loan protection","transaction trace",
  "end-to-end map","integration decisions","evidence","close",
];

const outputSlides = sourceSlides.map((sourceSlide, index) => {
  const p = path.join(BUILD, "template-inspect", "layouts", `source-slide-${String(sourceSlide).padStart(2,"0")}.layout.json`);
  const layout = JSON.parse(fs.readFileSync(p, "utf8"));
  const textIds = layout.elements.filter((e) => e.text).map((e) => e.aid);
  const imageIds = layout.elements.filter((e) => e.kind === "image").map((e) => e.aid);
  const editTargets = [{ action: "rewrite", sourceElementIds: textIds }];
  if (imageIds.length) editTargets.push({ action: "replace", sourceElementIds: imageIds });
  return {
    outputSlide: index + 1,
    sourceSlide,
    narrativeRole: roles[index],
    reuseMode: "duplicate-slide",
    editTargets,
  };
});

const out = {
  outputSlides,
  omittedSourceSlides: [{ sourceSlide: "other", reason: "The revision reuses the reference deck's field-guide, screen, matrix, map and appendix layouts." }],
};
fs.writeFileSync(path.join(BUILD, "template-frame-map-v02.json"), JSON.stringify(out, null, 2));
console.log(`Wrote ${outputSlides.length} mapped slides.`);
