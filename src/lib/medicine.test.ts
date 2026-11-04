import { describe, expect, test } from "bun:test";
import { isDoctorTitle, levelOf, medicinePlaceOf, specialtyOf, stateForPostalCode } from "./medicine.ts";

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

describe("stateForPostalCode", () => {
  test("finds the state of codes on both sides of a border", () => {
    expect(stateForPostalCode("38518")?.slug).toBe("lower-saxony");
    expect(stateForPostalCode("61462")?.slug).toBe("hesse");
    expect(stateForPostalCode("01067")?.slug).toBe("saxony");
    expect(stateForPostalCode("68159")?.slug).toBe("baden-wuerttemberg");
    expect(stateForPostalCode("67059")?.slug).toBe("rhineland-palatinate");
    expect(stateForPostalCode("27568")?.slug).toBe("bremen");
  });

  test("ignores anything that isn't a five-digit code", () => {
    expect(stateForPostalCode(undefined)).toBeUndefined();
    expect(stateForPostalCode("1234")).toBeUndefined();
    expect(stateForPostalCode("Berlin")).toBeUndefined();
  });
});

describe("isDoctorTitle", () => {
  test("keeps doctors and leaves out dentists and the people working for doctors", () => {
    expect(isDoctorTitle("Oberärztin / Oberarzt Neurologie (w/m/d)")).toBe(true);
    expect(isDoctorTitle("Assistenzarzt (m/w/d) für Radiologie")).toBe(true);
    expect(isDoctorTitle("Chefarztsekretär (m/w/d)")).toBe(false);
    expect(isDoctorTitle("Zahnarzt (m/w/d)")).toBe(false);
    expect(isDoctorTitle("Medizinische Fachangestellte (m/w/d)")).toBe(false);
    expect(isDoctorTitle("Medizinische Schreibkraft für den Chefarzt")).toBe(false);
  });
});

describe("titles from other countries", () => {
  test("UK, French and Nordic titles get a specialty and level", () => {
    expect([specialtyOf("Consultant Anaesthetist"), levelOf("Consultant Anaesthetist")]).toEqual(["anaesthesiology", "senior"]);
    expect([specialtyOf("Specialty Doctor in Haematology"), levelOf("Specialty Doctor in Haematology")]).toEqual(["oncology", "specialist"]);
    expect([specialtyOf("Salaried GP"), levelOf("Paediatric Registrar")]).toEqual(["general-practice", "resident"]);
    expect([specialtyOf("Médecin généraliste (H/F)"), specialtyOf("Pédiatre (H/F)"), specialtyOf("Anesthésiste réanimateur")]).toEqual([
      "general-practice",
      "paediatrics",
      "anaesthesiology",
    ]);
    expect([levelOf("Överläkare inom psykiatri"), levelOf("ST-läkare i allmänmedicin"), levelOf("Overlege, indremedisin")]).toEqual([
      "senior",
      "resident",
      "senior",
    ]);
  });
});
