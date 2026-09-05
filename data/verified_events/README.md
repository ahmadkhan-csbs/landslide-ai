# Verified contemporary NER events

This folder is the only curated input for future model-review work. It starts
empty on purpose: no event is labelled verified by software or by a model.

Each row must be independently checked by an authorised reviewer against an
official disaster-management record, a source record, or a well-documented
research inventory. Keep the source URL, stable source record ID, coordinate
accuracy, reviewer identifier, UTC review time, and short evidence note.

Run `python event_registry.py template`, copy the generated template to
`ner_verified_events.csv`, and then run `python event_registry.py validate`.
Validation checks NER bounds, dates, source URLs, accuracy, reviewer evidence,
and same-day events within one kilometre. Passing validation does **not**
retrain or deploy a model.
