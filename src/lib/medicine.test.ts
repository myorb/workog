import { describe, expect, test } from "bun:test";
import { levelOf, medicinePlaceOf, specialtyOf } from "./medicine.ts";

describe("specialtyOf", () => {
  test("reads the occupation's specialty", () => {
    expect(specialtyOf(undefined, "Facharzt/-ärztin - Innere Medizin")).toBe("internal-medicine");
    expect(specialtyOf(undefined, "Facharzt/-ärztin - Innere Medizin und Kardiologie")).toBe("cardiology");
    expect(specialtyOf(undefined, "Facharzt/-ärztin - Kinder- und Jugendpsychiatrie und -psychotherapie")).toBe("child-psychiatry");
    expect(specialtyOf(undefined, "Facharzt/-ärztin - Radioonkologie und Strahlentherapie")).toBe("radiology");
    expect(specialtyOf(undefined, "Facharzt/-ärztin - Allgemeinmedizin (Hausarzt/-ärztin)")).toBe("general-practice");
  });

  test("prefers the title over a generic occupation, and leaves unknown ones empty", () => {
    expect(specialtyOf("Oberarzt (m/w/d) Anästhesiologie", "Oberarzt/-ärztin")).toBe("anaesthesiology");
    expect(specialtyOf("Arzt (m/w/d)", "Arzt/Ärztin")).toBeUndefined();
    expect(specialtyOf("HNO-Arzt (m/w/d)")).toBe("ent");
  });
});

describe("levelOf", () => {
  test("reads the career level from the title first", () => {
    expect(levelOf("Leitender Oberarzt (m/w/d) Kardiologie", "Facharzt/-ärztin - Innere Medizin")).toBe("senior");
    expect(levelOf("Chefarzt (m/w/d) Chirurgie")).toBe("head");
    expect(levelOf("Assistenzarzt/Facharzt (m/w/d) Neurologie")).toBe("resident");
    expect(levelOf("Arzt (m/w/d)", "Facharzt/-ärztin - Neurologie")).toBe("specialist");
    expect(levelOf("Arzt (m/w/d)", "Arzt/Ärztin")).toBeUndefined();
  });
});

describe("medicinePlaceOf", () => {
  test("reads state and city from a German label", () => {
    expect(medicinePlaceOf({ locations: ["Halle (Saale), Sachsen-Anhalt, Germany"] })).toEqual({
      state: "saxony-anhalt",
      city: { slug: "halle-saale", name: "Halle (Saale)" },
    });
    expect(medicinePlaceOf({ locations: ["Berlin, Germany"] })).toEqual({});
  });
});
