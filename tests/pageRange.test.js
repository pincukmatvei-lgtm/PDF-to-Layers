const { parsePageRange } = require("../src/pageRange");

describe("parsePageRange", () => {
  test("empty input selects all pages", () => {
    expect(parsePageRange("", 3)).toEqual([1, 2, 3]);
    expect(parsePageRange("   ", 2)).toEqual([1, 2]);
    expect(parsePageRange(undefined, 1)).toEqual([1]);
  });

  test("single pages and ranges", () => {
    expect(parsePageRange("1-5, 8, 10-12", 12)).toEqual([1, 2, 3, 4, 5, 8, 10, 11, 12]);
    expect(parsePageRange("2-3, 5", 5)).toEqual([2, 3, 5]);
  });

  test("tolerates spaces, semicolons, en-dash and duplicates", () => {
    expect(parsePageRange(" 3 ; 1 – 2 ,, 2 ", 5)).toEqual([1, 2, 3]);
  });

  test("open-ended range runs to the last page", () => {
    expect(parsePageRange("4-", 6)).toEqual([4, 5, 6]);
  });

  test("rejects out-of-range pages", () => {
    expect(() => parsePageRange("0", 5)).toThrow(/начинаются с 1/);
    expect(() => parsePageRange("6", 5)).toThrow(/Страницы 6 нет/);
    expect(() => parsePageRange("3-9", 5)).toThrow(/Страницы 9 нет/);
  });

  test("rejects reversed ranges", () => {
    expect(() => parsePageRange("5-2", 5)).toThrow(/больше конца/);
  });

  test("rejects garbage", () => {
    expect(() => parsePageRange("abc", 5)).toThrow(/Некорректный/);
    expect(() => parsePageRange("1-2-3", 5)).toThrow(/Некорректный/);
    expect(() => parsePageRange("-3", 5)).toThrow(/Некорректный/);
    expect(() => parsePageRange(",", 5)).toThrow(/ни одной/);
  });

  test("rejects documents without pages", () => {
    expect(() => parsePageRange("", 0)).toThrow(/нет страниц/);
  });
});
