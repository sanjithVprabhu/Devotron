# DEPRECATED — `apps/onboarding-web/`

This was scaffolded as a "Veda interview, but in a web form" alternative for
business owners who don't want to start in WhatsApp. **It was never wired up
and the entry-point only had stub content.**

Today, business owners can:
1. Open the dashboard `/test-chat` and toggle the "Veda (setup)" mode to run the
   interview in a web chat UI.
2. Or text Veda on WhatsApp once that channel is paid.

**Status:** unreferenced. Not in any deployment target.

**If you want to revive it:** the dashboard's `TestChat.tsx` component is the
right starting point — extract it into this app with the Veda mode pre-selected
and a friendlier "Start your business" landing page.

**Removal date:** if not revived by 2027-01-01, delete the directory.
