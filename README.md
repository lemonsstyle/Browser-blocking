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
4. In "Applicable Sites / URL Prefixes", add the website this template should filter. Click "Use Current Site" to fill the current hostname, then adjust it if needed.
5. Use a domain such as `weibo.com` to include that domain and all its subdomains, or use a complete URL such as `https://weibo.com/u/` to limit the template to that URL prefix.
6. Edit the blocked keywords in the popup. Keywords can be separated by commas, spaces, semicolons, or new lines.
7. Adjust the letter count, separator rule, and digit count in "Code Pattern Filter".
8. Click "Save Current Template" to save the configuration to browser storage.
9. Results that match a keyword or the code pattern rule are hidden automatically. Newly loaded results are filtered as well.

## Template Rules

- Templates are selected automatically from the current page URL. A template without an applicable site or URL prefix does not filter any pages.
- If more than one template matches, the more specific URL prefix or domain is used. A later-saved template breaks an exact tie.
- Creating a template copies the current keywords and code pattern settings from the form.
- Switching templates only changes the template being edited in the popup; site matching determines filtering.
- Keywords saved by older versions are read as the "Default Template", but must be assigned a site before filtering resumes.

## Implementation

- `content.js` first selects a template that matches the current page's domain or URL prefix, then scans common result containers such as list items, table rows, cards, title links, and headings.
- If a container's text matches a blocked keyword, the extension sets it to `display: none`.
- A `MutationObserver` watches asynchronously loaded content so pagination and lazy-loaded results continue to be filtered.
