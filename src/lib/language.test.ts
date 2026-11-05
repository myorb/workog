import { describe, expect, test } from "bun:test";
import { detectLanguage, jobLanguage } from "./language.ts";

describe("detectLanguage", () => {
  test.each([
    ["en", "<p>We are looking for an engineer to join our team. You will work with the platform group and have a say in what we build from day one.</p>"],
    ["de", "<p>Wir suchen für unsere Klinik eine Ärztin oder einen Arzt in Weiterbildung. Sie arbeiten im Team mit erfahrenen Kollegen und werden von uns bei der Weiterbildung unterstützt.</p>"],
    ["fr", "<p>Le Centre Hospitalier recrute un médecin pour son service de gériatrie. Vous rejoindrez une équipe dynamique dans un établissement à taille humaine, avec des perspectives d'évolution.</p>"],
    ["sv", "<p>Vill du vara med och utveckla framtidens psykiatri tillsammans med engagerade kollegor? Vi är en verksamhet där patientens återhämtning står i centrum och du har stort inflytande.</p>"],
    ["nl", "<p>Voor onze afdeling zoeken wij een arts die het team komt versterken. Je werkt nauw samen met collega's en bent het eerste aanspreekpunt voor patiënten op de afdeling.</p>"],
    ["el", "<p>Το νοσοκομείο αναζητά ιατρό ειδικότητας παθολογίας για πλήρη απασχόληση.</p>"],
  ])("%s", (lang, html) => expect(detectLanguage(html)).toBe(lang));

  test("is unsure about short or unknown text", () => {
    expect(detectLanguage("<p>Senior Software Engineer</p>")).toBeUndefined();
    expect(detectLanguage("")).toBeUndefined();
    // Latvian is not among the languages it knows
    expect(detectLanguage("<p>SIA Rīgas veselības centrs filiāle Imanta steidzami aicina darbā pediatru, sertificētu ārstu ar pieredzi.</p>")).toBeUndefined();
  });

  test("reads text, not markup", () => {
    expect(detectLanguage('<div class="the and of with"><p>Wir suchen Sie für unser Team und bieten Ihnen eine Stelle mit Zukunft bei der Klinik.</p></div>')).toBe("de");
  });
});

describe("jobLanguage", () => {
  test("falls back to a German title's gender marker when there is no description", () => {
    expect(jobLanguage({ title: "Oberarzt Onkologische Ambulanz (m/w/d)", descriptionHtml: "" })).toBe("de");
    expect(jobLanguage({ title: "Assistenzarzt (w/m/d) Innere Medizin", descriptionHtml: "" })).toBe("de");
    expect(jobLanguage({ title: "Leitender Oberarzt Psychiatrie", descriptionHtml: "" })).toBeUndefined();
  });
});
