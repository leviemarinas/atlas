import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, PresentationFile } from "@oai/artifact-tool";

const ROOT = String.raw`C:\Users\josrp\OneDrive\Documents\Atlas\client-meetings\2026-08-24-computational-basis-integration`;
const BUILD = path.join(ROOT, "build");
const EVIDENCE = path.join(ROOT, "evidence");
const OUTPUT = path.join(ROOT, "outputs", "ATLAS_2026-08-24_Computational_Basis_Integration_PreMeeting_v01.pptx");

const deck = await PresentationFile.importPptx(await FileBlob.load(path.join(BUILD, "template-starter.pptx")));
const inspection = await deck.inspect({ kind: "slide,textbox,image", maxChars: 1000000 });
const records = inspection.ndjson.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
const bySlide = new Map();
for (const record of records) {
  if (!record.slide) continue;
  if (!bySlide.has(record.slide)) bySlide.set(record.slide, { textboxes: [], images: [] });
  if (record.kind === "textbox") bySlide.get(record.slide).textboxes.push(record.id);
  if (record.kind === "image") bySlide.get(record.slide).images.push(record.id);
}

const copy = {
  1: [
    "ATLAS PHASE 2 · PAYROLL",
    "Computational Basis",
    "How computations are created, assigned to clients, and consumed across payroll and connected modules",
    "Define",
    "Test & Version",
    "Assign",
    "Consume & Trace",
    "Working prototype · finance-user walkthrough · every application screen in this deck is live evidence",
  ],
  2: [
    "LEARNING PATH",
    "What finance users will understand",
    "1", "Purpose", "Why Computational Basis exists and which objects it governs.",
    "2", "Create", "How to build a computation from approved variables and operators, then test it.",
    "3", "Assign", "How client assignments define type, reference table, employee group, frequency and status.",
    "4", "Consume", "What payroll and other modules must provide before they can execute a computation.",
    "5", "Trace", "How versions, reference sources, transaction trails, payslips and reports preserve the result.",
  ],
  3: [
    "THE IDEA IN ONE PICTURE",
    "A computation moves through five controlled stages",
    "1", "Define", "Give the computation a code, name, category and business purpose.",
    "2", "Build & test", "Combine approved variables and operators; prove the result with sample inputs.",
    "3", "Publish version", "Set the effective date and change note so history remains reproducible.",
    "4", "Assign", "Match the code to a client use case, employee group and payroll frequency.",
    "5", "Consume & trace", "A module supplies real inputs, invokes the code and records the result chain.",
    "Creation makes the formula governed. Assignment makes it eligible. A consuming module call makes it execute.",
    "Source · live ATLAS prototype and application computation catalog / payroll engine",
  ],
  4: [
    "ORIENTATION",
    "Where Computational Basis sits",
    "Computational Basis — live application view",
    "One governed workspace",
    "Computations, client assignments, policy engines, reference sources and change history share one controlled area.",
    "Payroll service context",
    "The workspace belongs under Payroll because its outputs become payroll inputs, calculations and audit evidence.",
    "Reached from",
    "Company Info → Services Information → Payroll → Computational Basis.",
    "Source · requested information architecture and live ATLAS prototype",
  ],
  5: [
    "CORE CONCEPTS",
    "What each object means",
    "Computational variable", "An approved input token, such as allowance_units, salary or overtime_hours.",
    "Expression", "The readable formula assembled from approved variables and operators.",
    "Computation code", "The stable identifier a consuming module calls, for example CUS-900 or ERN-002.",
    "Client assignment", "The applicability rule linking a code to a type, reference table, employee group and frequency.",
    "Reference source", "An effective-dated rate, ceiling, table or business ordering used by formula inputs.",
    "Consumer", "Payroll or another module that supplies actual inputs and invokes the computation code.",
    "Version", "An effective-dated formula state retained so historical transactions can be reproduced.",
    "Policy engine", "An existing specialized consumer for policy families; it is context, not the focus of this walkthrough.",
    "Trace", "The evidence chain from source fields and assignment through formula, result and output.",
  ],
  6: [
    "THE LIBRARY",
    "Every computation has an identity and lifecycle",
    "Computations register — live application view",
    "Standard and custom codes",
    "The same catalog exposes governed standard codes and finance-created custom computations.",
    "Searchable metadata",
    "Code, name, category, status and description help users find the right computation before assigning it.",
    "Open one record",
    "Review its expression, mapped fields, test state, effective version and change history.",
    "Source · live ATLAS Computational Basis → Computations",
  ],
  7: [
    "COMPUTATION · DEMO",
    "Create a variable-based computation from start to finish",
    "Watch the governed creation flow",
    "1 · Enter code, name, category, status and business description.",
    "2 · Build the expression from approved fields.\n3 · Test sample inputs, add effectivity and publish the version.",
    "Animated walkthrough — plays automatically in Slide Show",
  ],
  8: [
    "CREATING A COMPUTATION",
    "Step 1 — define its business identity",
    "Metadata is the control surface",
    "CUS-900 · Variable Allowance by Approved Units · Earnings · Active",
    "Use a stable code and a plain-language description so finance, implementers and auditors agree on what the formula is intended to calculate.",
    "Source · live create-computation workflow; demonstration code CUS-900",
  ],
  9: [
    "CREATING A COMPUTATION",
    "Step 2 — assemble approved variables",
    "Build, do not free-type dependencies",
    "{{allowance_units}} × {{allowance_unit_rate}}",
    "The palette exposes approved fields and operators. Mapped fields make every dependency visible before the formula reaches a transaction.",
    "Source · computation catalog and live expression-builder workflow",
  ],
  10: [
    "CREATING A COMPUTATION",
    "Step 3 — test, date and publish the version",
    "1 · Test",
    "Run controlled sample inputs; 8 approved units × ₱250 per unit = ₱2,000.",
    "2 · Date",
    "Set the effective date that consuming transactions use for version selection.",
    "3 · Publish",
    "Record the change note and retain history; later changes should create a new version.",
    "Source · live test calculation and change-history workflow",
  ],
  11: [
    "THE GOVERNANCE BOUNDARY",
    "Created and assigned does not automatically mean executed",
    "CUS-900 in the governed computations register",
    "Creation result",
    "The code is active, searchable, testable, versioned and available for assignment.",
    "Execution contract",
    "A payroll or other module must still call CUS-900 and supply allowance_units and allowance_unit_rate at the right business event.",
    "Why this matters",
    "Assignments govern eligibility and traceability; they are not a hidden replacement for module integration logic.",
    "Source · live prototype behavior and payrollEngine.js integration review",
  ],
  12: [
    "CLIENT ASSIGNMENT · DEMO",
    "Connect a computation to its intended company use",
    "1 · Choose context",
    "Select assignment type and its reference table.",
    "2 · Define scope",
    "Choose the computation code, employee group and frequency.",
    "3 · Confirm governance",
    "Set active status, review the applicability contract and save.",
    "Animated walkthrough — plays automatically in Slide Show",
  ],
  13: [
    "CLIENT ASSIGNMENTS",
    "The assignment is an applicability contract",
    "1 · Business context",
    "Type · reference table · computation code · employee group · frequency · status.",
    "2 · Transaction match",
    "Resolve the active assignment for company, employee group, event/frequency and effective date.",
    "3 · Conflict validation",
    "Reject overlapping applicability or effective periods unless explicit precedence is configured.",
    "Source · live ATLAS Computational Basis → Client assignments",
  ],
  14: [
    "CONNECTED DATA",
    "Reference sources keep changeable values outside formulas",
    "Formula reference sources — live application view",
    "Named dependencies",
    "Rates, brackets, ceilings, balances and orderings are maintained as sources instead of buried inside an expression.",
    "Effective selection",
    "The transaction date selects the version in force, preserving historical reproducibility.",
    "Shared maintenance",
    "A governed source can serve many computations without duplicating the same value in every formula.",
    "Source · live reference-source register and formula reference catalog",
  ],
  15: [
    "THE CONSUMPTION CONTRACT",
    "What a module needs before it can use a computation",
    "Consumer provides",
    "System returns",
    "Code + input fields",
    "Invoke an approved code and supply every mapped variable with typed transaction values.",
    "Calculated value plus evaluated expression and input evidence.",
    "Applicable scope",
    "Resolve active client assignment by employee group, type, reference and frequency.",
    "Eligible computation set, with conflicts blocked before calculation.",
    "Effective date",
    "Use transaction date to select the formula and reference-source versions in force.",
    "A reproducible historical result even after later versions are published.",
    "Business event",
    "Call the code at the correct point in HRM, timekeeping, payroll preparation or processing.",
    "A downstream line item, balance, payslip value, report field and audit trace.",
  ],
  16: [
    "MODULE DEPENDENCIES",
    "How Computational Basis connects across ATLAS",
    "Module supplies",
    "Computation affects",
    "HRM / Employee Masterfile",
    "Salary, dates, employee group, status, plan and profile attributes.",
    "Eligibility, bases, group-specific assignment and employee-level trace.",
    "Timekeeping",
    "Hours, days, shifts, overtime, absences and approved quantity units.",
    "Payable quantities used by earnings, premium and attendance computations.",
    "Payroll setup / registers",
    "Earning, deduction, loan and bonus codes; rates; balances; ceilings; reference tables.",
    "Formula inputs, caps, priorities, taxable treatment and carried balances.",
    "Payroll processing / outputs",
    "Run date, employee scope, applicable assignment and transaction context.",
    "Payroll lines, net pay, statutory/tax results, payslip, reports and computation trail.",
  ],
  17: [
    "CUSTOM COMPUTATION · WORKED EXAMPLE",
    "CUS-900 proves the full create-and-assign pattern",
    "Approved units",
    "8",
    "Unit rate",
    "₱250",
    "Expression",
    "8 × ₱250",
    "Computed result",
    "₱2,000",
    "Employee scope",
    "All Employees",
    "Frequency",
    "Every payroll",
    "Demonstration only: a consuming earnings flow must still call CUS-900 with actual approved units and the effective unit rate.",
    "Source · live CUS-900 test and client-assignment walkthrough",
  ],
  18: [
    "TRANSACTION TRACE",
    "A posted payroll shows where governed computations are consumed",
    "Payroll computation trail — live application view",
    "Upstream evidence",
    "Transaction settings, company configuration, employee salary, timekeeping and earning/deduction/loan registers establish the inputs.",
    "Governed execution",
    "Applicable assignments and computation codes are resolved before formulas and statutory/tax/policy steps run.",
    "Downstream proof",
    "Each payroll line can flow to the payslip and reports with the calculation trail preserved.",
    "Source · posted payroll PR-2025-11-E2E → John Collins Doe → How it was computed",
  ],
  19: [
    "E N D - T O - E N D   F L O W",
    "How a finance-defined computation becomes a transaction result",
    "Use this map to separate design-time governance from transaction-time execution.",
    "SETUP PATH",
    "Company\nInfo",
    "Services\nInformation",
    "Payroll",
    "Computational\nBasis",
    "1", "Define variable", "Choose an approved field or add a governed business variable with a clear owner and source.",
    "2", "Create computation", "Set metadata and assemble an expression from approved variables and operators.",
    "3", "Test + publish", "Prove sample outputs, set effectivity, record the change note and retain the version.",
    "4", "Assign client scope", "Link code to type, reference table, employee group, frequency and active status.",
    "HRM", "TIME", "PAY", "OUT",
    "5", "Consume + trace", "The module resolves scope/date, supplies actual inputs, executes the code and writes the result to transaction outputs.",
    "CREATE COMPUTATION",
    "1  Metadata",
    "2  Expression",
    "3  Test + version",
    "4  Assign",
    "INTEGRATION GUARDRAILS",
    "Unique stable code",
    "Consumers integrate to the code, not a display name.",
    "Approved inputs",
    "Every mapped field has a defined module owner and data type.",
    "No assignment conflict",
    "Overlapping scope or effective periods are rejected before use.",
    "History preserved",
    "Used versions are not rewritten; a new effective version carries the change.",
    "Source · live ATLAS workflow, computation catalog and payroll trace",
  ],
  20: [
    "INTEGRATION CHECKPOINTS",
    "What must be decided before a custom computation goes live",
    "Saving the formula and assignment establishes governance. These five decisions establish operational execution.",
    "1", "Which module invokes the code", "Name the consumer and exact pipeline step; arbitrary new custom codes are not executed automatically.", "Consumer contract",
    "2", "Which business event applies", "Define payroll frequency or the HRM/timekeeping event that supplies the real inputs.", "Trigger and frequency",
    "3", "How conflicts are resolved", "Reject overlapping employee scope, assignment type, reference and effective periods unless precedence is explicit.", "Assignment validation",
    "4", "When a version becomes immutable", "Once a payroll transaction uses a version, changes should publish a new effective version.", "Historical integrity",
    "5", "Who owns approval", "Define finance owner, reviewer and deployment evidence for formula, assignment and reference-source changes.", "Governance workflow",
  ],
  21: [
    "APPENDIX A",
    "Evidence and traceability",
    "Reference deck",
    "ATLAS Phase 2 Computational Basis Demo v2",
    "Visual system, explanatory pacing, live-screen pattern and end-to-end traceability structure reused for this new deck.",
    "Live prototype",
    "ATLAS local application · 24 August 2026",
    "Computations, client assignments, reference sources, change history and payroll computation-trail screens captured directly from the running app.",
    "Application source",
    "ComputationalBasis.jsx · computationCatalog.js · payrollEngine.js",
    "Used to distinguish governed creation/assignment behavior from actual transaction-time invocation.",
    "Demonstration record",
    "CUS-900 · 8 units × ₱250 = ₱2,000",
    "Sample values created only for this walkthrough; they are not production payroll values.",
  ],
  22: [
    "What this demonstrates",
    "1", "Finance users can create readable, tested and effective-dated computations without changing application code.",
    "2", "Client assignments make applicability explicit by use case, reference, employee group, frequency and status.",
    "3", "Payroll and connected modules consume a computation only through a defined code, inputs, scope, date and business event.",
    "4", "Versions, reference sources and transaction trails preserve the overall picture from setup to payslip and reports.",
  ],
};

const imagePlan = {
  4: [["screenshots/computational-basis-overview.png", "image/png", "Computational Basis workspace"]],
  6: [["screenshots/computational-basis-overview.png", "image/png", "Computations register"]],
  7: [["computation-creation-walkthrough.gif", "image/gif", "Animated computation creation walkthrough"]],
  8: [["../build/gif-computation/frame-03.png", "image/png", "Computation metadata step"]],
  9: [["../build/gif-computation/frame-04.png", "image/png", "Expression builder and mapped fields"]],
  10: [["../build/gif-computation/frame-06.png", "image/png", "Successful test calculation"]],
  11: [["screenshots/created-computation.png", "image/png", "Created custom computation"]],
  12: [["client-assignment-walkthrough.gif", "image/gif", "Animated client assignment walkthrough"]],
  13: [["screenshots/client-assignment-created.png", "image/png", "Created client assignment"]],
  14: [["screenshots/formula-reference-sources.png", "image/png", "Formula reference sources"]],
  17: [
    ["../build/gif-computation/frame-06.png", "image/png", "CUS-900 test result"],
    ["screenshots/client-assignment-created.png", "image/png", "CUS-900 client assignment"],
  ],
  18: [["screenshots/payroll-computation-trail.png", "image/png", "Posted payroll computation trail"]],
};

function fullEvidencePath(rel) {
  if (rel.startsWith("../build/")) return path.join(ROOT, rel.replace("../", ""));
  return path.join(EVIDENCE, rel);
}

async function replaceImage(anchorId, filePath, contentType, alt) {
  const image = deck.resolve(anchorId);
  const oldFrame = image.frame;
  const oldCrop = image.crop;
  const oldFit = image.fit;
  const oldGeometry = image.geometry;
  const oldBorderRadius = image.borderRadius;
  const oldRotation = image.rotation;
  const oldFlipHorizontal = image.flipHorizontal;
  const oldFlipVertical = image.flipVertical;
  const oldLockAspectRatio = image.lockAspectRatio;
  const bytes = await fs.readFile(filePath);
  const blob = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  image.replace({ blob, contentType, alt, ...(oldFit ? { fit: oldFit } : {}) });
  image.frame = oldFrame;
  image.crop = oldCrop;
  image.geometry = oldGeometry;
  image.borderRadius = oldBorderRadius;
  image.rotation = oldRotation;
  image.flipHorizontal = oldFlipHorizontal;
  image.flipVertical = oldFlipVertical;
  image.lockAspectRatio = oldLockAspectRatio;
}

for (let slideNo = 1; slideNo <= 22; slideNo += 1) {
  const targets = bySlide.get(slideNo)?.textboxes ?? [];
  const values = copy[slideNo];
  if (targets.length !== values.length) {
    throw new Error(`Slide ${slideNo}: expected ${targets.length} text values, received ${values.length}`);
  }
  for (let i = 0; i < targets.length; i += 1) {
    deck.resolve(targets[i]).text = values[i];
  }
  const slideImages = bySlide.get(slideNo)?.images ?? [];
  const replacements = imagePlan[slideNo] ?? [];
  if (replacements.length > slideImages.length) {
    throw new Error(`Slide ${slideNo}: image plan exceeds inherited image slots`);
  }
  for (let i = 0; i < replacements.length; i += 1) {
    const [rel, type, alt] = replacements[i];
    await replaceImage(slideImages[i], fullEvidencePath(rel), type, alt);
  }

  const slideRecord = records.find((record) => record.kind === "slide" && record.slide === slideNo);
  const slide = deck.resolve(slideRecord.id);
  const source = slideNo === 21
    ? "Reference deck; live ATLAS prototype; ComputationalBasis.jsx; computationCatalog.js; payrollEngine.js"
    : slideNo === 17
      ? "Live ATLAS prototype demonstration CUS-900; computation-creation and client-assignment captures"
      : "Live ATLAS prototype and ATLAS_Phase2_Computational_Basis_Demo_v2.pptx";
  slide.speakerNotes.textFrame.setText(
    `Presenter note: explain this slide from a finance-user perspective and distinguish setup-time governance from transaction-time execution.\n\n[Sources]\n- ${source}\n- Evidence captured 24 August 2026 in the local ATLAS application.`,
  );
  slide.speakerNotes.setVisible(true);
}

await fs.mkdir(path.dirname(OUTPUT), { recursive: true });
const exported = await PresentationFile.exportPptx(deck);
await exported.save(OUTPUT);
console.log(JSON.stringify({ output: OUTPUT, slides: 22 }, null, 2));
