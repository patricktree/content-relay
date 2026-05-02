import { expect, test } from "vitest";

import { createShareDraft } from "#pkg/share-draft.ts";

test("createShareDraft treats a shared absolute URL as a URL draft", () => {
  expect(
    createShareDraft({
      shareId: "4c5ec32b-46b7-4d4b-9d52-4e65f1cf3a45",
      text: "  https://example.com/article  ",
      title: "  Example article  ",
    }),
  ).toEqual({
    dedupeKey: "4c5ec32b-46b7-4d4b-9d52-4e65f1cf3a45",
    itemType: "url",
    title: "Example article",
    value: "https://example.com/article",
  });
});

test("createShareDraft treats non-URL shared text as a text draft", () => {
  expect(
    createShareDraft({
      shareId: "c5b48ba6-c6bd-4027-99b5-e4e9d4c7ba3f",
      text: "  remember to buy coffee beans  ",
      title: null,
    }),
  ).toEqual({
    dedupeKey: "c5b48ba6-c6bd-4027-99b5-e4e9d4c7ba3f",
    itemType: "text",
    title: "",
    value: "remember to buy coffee beans",
  });
});

test("createShareDraft fails fast for empty shared shareId", () => {
  expect(() => createShareDraft({ shareId: "   ", text: "hello" })).toThrowError(
    "Expected shared shareId to be non-empty.",
  );
});

test("createShareDraft fails fast for empty shared text", () => {
  expect(() =>
    createShareDraft({ shareId: "cf00b4a4-9f82-4a58-8140-a5585ee6a652", text: "   " }),
  ).toThrowError("Expected shared text to be non-empty.");
});
