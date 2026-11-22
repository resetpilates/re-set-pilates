import { expect, test } from "bun:test";
import { photoBase64, squareCrop } from "./photo";

test("a card photo is cropped to the centre square", () => {
  expect(squareCrop(4000, 3000)).toEqual([500, 0, 3000]); // landscape
  expect(squareCrop(3000, 4000)).toEqual([0, 500, 3000]); // portrait
  expect(squareCrop(480, 480)).toEqual([0, 0, 480]);
});

test("the relay gets the base64 part of the photo only", () => {
  expect(photoBase64("data:image/jpeg;base64,/9j/AAAA")).toBe("/9j/AAAA");
});
