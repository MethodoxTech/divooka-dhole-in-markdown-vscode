# Dhole in Markdown

A flowchart:

```dhole
flowchart Making tea
Thirsty? [start] -> Boil the kettle -> Tea or coffee?
Tea or coffee? -> Steep the tea: tea
Tea or coffee? -> Brew the coffee: coffee
Steep the tea -> Enjoy [end, good]
Brew the coffee -> Enjoy
```

A mistake, drawn as far as it can be:

```dhole
flowchart
direction: sideways
A -> B [blu]
```

A theme of its own:

```dhole
sequence Paying at the till
theme: golden
actor Customer
participant Till
Customer -> Till: Scan the items
Till --> Customer: Receipt
```

Nothing to draw:

```dhole
piano Song
```
