![Screenshot](https://extensions.gnome.org/extension-data/screenshots/screenshot_549_1.png)

#### Search the web directly from Gnome Shell.
< Ctrl >+space triggers the dialog. From there, type your search query, click the ENTER key and your default browser will open with your search result.

List of features include:
- Instant result/definition (DuckDuckGo helper) with pictures within the dialog
- Search Suggestions
- History with configurable limit
- Choose your default search engine
- Add multiple seach engines
- Tab key to view & choose from search engine list
- Ctrl+Shift+V to Paste & Search
- Ctrl+Shift+G to Paste & Go (Open URL)
- Ctrl+(1-9) to trigger search suggestion or history item in list
- Add keyword for each search engine
- Add keyword to go to URL directly

----

# Installation

After the installation, restart GNOME Shell (`Alt`+`F2`, `r`, `Enter`) and enable the extension through *gnome-tweak-tool*.

### Install older version
Navigate into the extension directory (e.g. `~/.local/share/gnome-shell/extensions/web_search_dialog@awamper.gmail.com`) and run ` git co X` Replace X with your GNOME Shell version (e.g. 3.20).

## Through extensions.gnome.org (Local installation)

Go on the [Web Search Dialog ](https://extensions.gnome.org/extension/549/web-search-dialog/) extension page on extensions.gnome.org, click on the switch ("OFF" => "ON"), click on the install button.

## Generic (Local installation)

Run the following command:

`git clone https://github.com/awamper/web-search-dialog.git ~/.local/share/gnome-shell/extensions/web_search_dialog@awamper.gmail.com`


## Generic (Global installation, requires root)

Run the following command:

`sudo git clone https://github.com/awamper/web-search-dialog.git /usr/share/gnome-shell/extensions/web_search_dialog@awamper.gmail.com/`
