# Deferred queue

Work that was stopped by YELLOW or RED mode, or that is only worth starting after a reset. `/pace` pulls from here in
BURN and GREEN mode. One entry per line, oldest first. Remove a line when it is started.

Format: `- [ ] <roadmap id or title> | est % | resume from: <file or section> | queued <date> | why`

(empty)
