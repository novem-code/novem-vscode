# novem - datavisualisation in your editor

[novem](https://novem.io/) is a datavisualisation platform for coders – create
charts, documents, emails and reports right from your code. With novem for VS
Code you can browse, edit and preview your novem visuals from your editor.

![email example](./img/mail_example.png)

## Installation

Install through VS Code extensions. Search for `novem`

[Visual Studio Code Market Place: novem](https://marketplace.visualstudio.com/items?itemName=novem.novem-vscode)

Can also be installed in VS Code: Launch VS Code Quick Open (Ctrl+P), paste
the following command, and press enter.

```
ext install novem.novem-vscode
```

## Getting started

You'll need a valid novem account. To sign in, open the novem bar in the
activity bar and click "Sign in to Novem", or run `novem: Login` from the
command palette. The login itself happens in your browser.

If you already use the novem CLI or one of the novem libraries, the extension
reads the same configuration and no separate sign-in is needed.

## Profiles

The novem configuration can hold several profiles, for example for separate
accounts or environments:

-   `novem: Login New Profile` signs in with another account and saves it as
    a new profile
-   `novem: Select Profile` switches the active profile
-   `novem: Edit Config File` opens the configuration file for manual editing

These commands are available from the command palette and from the `⋯` menu
on the novem views.

## Working with your visuals

The novem bar lists the resources on your account, grouped into plots,
e-mails, grids, documents, jobs and repos.

Each view has a `+` button for creating new resources, and the right-click
menu lets you view, edit, rename and delete existing ones. Some resource
types have additional actions:

-   E-mails can be tested and sent. `Test` delivers the mail to your own
    address; `Send` shows a summary of the to/cc/bcc lists and asks for
    confirmation first.
-   Jobs can be run.
-   Repos can be cloned to your machine.

## Editing and previews

Expanding a resource in the tree shows its files. These are read from the
novem API and written back when you save; there is no local copy.

View opens a preview of a plot, e-mail, grid or document in an editor tab.

Content files (e-mail and document content, grid layouts and mappings) are
highlighted as nv_markdown, a markdown variant with novem extensions. The
same highlighting applies to local `.nvm` and `.nvmd` files.
