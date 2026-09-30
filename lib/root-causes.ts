/**
 * Plain definitions of the shared root-cause categories, shown to teams next
 * to the dropdown ("What do these mean?"). All four cases use the same list,
 * so the definitions never hint at a specific case. `npm run validate:cases`
 * checks that every option in every case has a definition here.
 */
export const ROOT_CAUSE_RULE = "Choose the most specific category that describes the direct cause of the incident.";

export const ROOT_CAUSE_HELP: Record<string, string> = {
  "Compromised credentials / external attacker": "Someone outside the organisation got in (for example with stolen passwords or keys) and caused it.",
  "Deliberate insider action": "A person inside the organisation caused it on purpose.",
  "Human error during an approved change": "The planned change was sound, but the person carrying it out made a mistake (a wrong step, the wrong order, the wrong target).",
  "Buggy code release": "Newly deployed software contained a defect: it did something its developers did not intend, even though it was deployed as planned.",
  "Bad or wrongly formatted input data": "The software worked as written, but the data it was given was wrong or in an unexpected format.",
  "AI model or prompt error": "An AI model, or the prompt/instructions it was given, produced wrong output from correct input.",
  "Prompt injection": "Text hidden in the AI's input manipulated it into doing something it should not.",
  "Hardware failure": "A physical device (sensor, disk, server, network equipment) broke or malfunctioned.",
  "Test or staging activity hitting production": "Testing, replay or staging systems sent traffic, data or commands to the live system.",
  "Third-party service outage": "A service run by another company was down or unavailable.",
};
