---
type: Fixed
title: The released library keeps its own pictures
---

After a release, the deploy built every slot's library pictures once and shared
them, so the released site would have shown the art and link previews generated
from `main` beside its own release's numbers and prose. Each slot now gets the
pictures belonging to the content it was actually built from, and a picture set
whose generation failed part-way is no longer mistaken for a finished one.
