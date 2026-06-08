# Result Keyword Filter

English | [简体中文](README.zh-CN.md)

A minimal Chrome / Edge extension that hides search result items whose titles contain blocked keywords.

## Default Blocked Keywords

The default keyword list is empty. Add your own keywords in the extension popup.

## Default Code Pattern Rule

- Filtering is enabled
- Minimum letters: `3`
- Maximum letters: `5`
- Separator: `none, hyphen, or space`
- Minimum digits: `3`
- Maximum digits: `4`

## Installation

1. Open the Chrome or Edge extensions page.
2. Enable Developer mode.
3. Choose "Load unpacked".
4. Select this project directory.

## Usage

1. Open a target search results page.
2. Click the extension icon in the browser toolbar.
3. Select a template at the top of the popup, or click "New Template" to create a new blocking configuration.
4. After switching templates, all pages use the currently selected template.
5. Edit the blocked keywords in the popup. Keywords can be separated by commas, spaces, semicolons, or new lines.
6. Adjust the letter count, separator rule, and digit count in "Code Pattern Filter".
7. Click "Save Current Template" to save the configuration to browser storage.
8. Results that match a keyword or the code pattern rule are hidden automatically. Newly loaded results are filtered as well.

## Template Rules

- The currently selected template is global and is not bound to a domain.
- Creating a template copies the current keywords and code pattern settings from the form.
- Switching templates immediately refilters the page with the new template.
- Keywords saved by older versions are read as the "Default Template".

## Implementation

- `content.js` scans common result containers such as list items, table rows, cards, title links, and headings.
- If a container's text matches a blocked keyword, the extension sets it to `display: none`.
- A `MutationObserver` watches asynchronously loaded content so pagination and lazy-loaded results continue to be filtered.
