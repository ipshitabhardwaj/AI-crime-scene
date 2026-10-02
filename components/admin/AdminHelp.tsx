import HelpDialog, { HelpSteps } from "@/components/HelpDialog";

/** "How to run the event" guide for organisers. */
export default function AdminHelp() {
  return (
    <HelpDialog label="How it works" title="How to run the event" storageKey="aif-help-admin-v1">
      <p>The tabs are in the order you use them. Work left to right.</p>
      <HelpSteps
        steps={[
          ["Setup (before the day)", "Tick off every item on the Setup checklist. Each red item has a Fix link."],
          ["Cases", "Upload the 4 case files and delete the sample case."],
          ["Teams", "Import the registration CSV, print the login slips, and check teams in at the desk."],
          ["Control room (during the event)", "Press the big Go button when it is time for the next step. There is only ever one next step. Put the Projector page on the big screen."],
          ["Live status", "See every team: logged in, questions answered, submitted. Give one team extra time or unlock a submission here."],
          ["Results (after Close)", "Auto-score, assign judges, create the shortlist, then reveal. Export the CSV."],
        ]}
      />
      <p className="text-muted">
        Only one organiser should press the Control room buttons. Nothing is lost by mistake: locked work is never unlocked by going back, and Reset needs you to type RESET.
        The full day plan is in RUNBOOK.md.
      </p>
    </HelpDialog>
  );
}
