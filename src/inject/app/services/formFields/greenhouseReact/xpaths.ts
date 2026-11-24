export const xpaths = {
  TEXT_INPUT: [
    `.//div[contains(concat(" ", normalize-space(@class), " "), " text-input-wrapper ")]`,
    `[.//input[@type="text" or @type="tel" or @type="email" or @type="url"]]`,
  ].join(''),

  NUMBER_INPUT: [
    `.//div[contains(concat(" ", normalize-space(@class), " "), " text-input-wrapper ")]`,
    `[.//input[@type="number"]]`,
  ].join(''),

  TEXTAREA: [`.//div[contains(concat(" ", normalize-space(@class), " "), " text-input-wrapper ")]`, `[.//textarea]`].join(''),

  FILE: [`.//div[contains(concat(" ", normalize-space(@class), " "), " file-upload ")]`].join(''),

  DROPDOWN: [
    `.//div`,
    `[contains(concat(" ", normalize-space(@class), " "), " select ")]`,
    `[.//button[@aria-label="Toggle flyout"]]`,
    `[not(.//div[contains(@class, "is-multi")])]`,
  ].join(''),

  DROPDOWN_SEARCHABLE: [
    `.//div`,
    `[contains(concat(" ", normalize-space(@class), " "), " select ")]`,
    `[.//button[@aria-label="Toggle flyout"]]`,
    `[not(.//div[contains(@class, "is-multi")])]`,
  ].join(''),

  ADDRESS_SEARCHABLE: [
    `.//div`,
    `[contains(concat(" ", normalize-space(@class), " "), " select ")]`,
    `[not(.//button[@aria-label="Toggle flyout"])]`,
  ].join(""),

  DROPDOWN_MULTI_SEARCHABLE: [
    `.//div`,
    `[contains(concat(" ", normalize-space(@class), " "), " select ")]`,
    `[.//button[@aria-label="Toggle flyout"]]`,
    `[.//div[contains(@class, "is-multi")]]`,
  ].join(''),

  CHECKBOX_MULTI: [
    `.//fieldset`,
    `[contains(concat(" ", normalize-space(@class), " "), " checkbox ")]`,
    `[count(.//input[@type="checkbox"]) > 1]`,
  ].join(''),

  CHECKBOX_BOOLEAN: [
    `.//fieldset`,
    `[contains(concat(" ", normalize-space(@class), " "), " checkbox ")]`,
    `[count(.//input[@type="checkbox"]) = 1]`,
  ].join(''),
}
