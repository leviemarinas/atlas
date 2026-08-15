import { PresentationFile, FileBlob } from '@oai/artifact-tool';

const deck = await PresentationFile.importPptx(await FileBlob.load('template-starter.pptx'));
for (const slideIndex of [30, 31]) {
  const slide = deck.slides.items[slideIndex];
  console.log(`SLIDE ${slideIndex + 1}`);
  for (const shape of slide.shapes.items) {
    console.log(JSON.stringify({ id: shape.id, name: shape.name, type: shape.type, geometry: shape.geometry, text: shape.text?.toString?.() ?? '', position: shape.position }));
  }
  for (const pic of slide.images.items) {
    console.log('IMAGE', JSON.stringify({ id: pic.id, name: pic.name, position: pic.position }));
    console.log('IMAGE_PROTO', Object.getOwnPropertyNames(Object.getPrototypeOf(pic)).join(','));
  }
  if (slide.shapes.items[0]) console.log('SHAPE_PROTO', Object.getOwnPropertyNames(Object.getPrototypeOf(slide.shapes.items[0])).join(','));
}
