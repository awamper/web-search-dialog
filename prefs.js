/** Credit:
 *  based off prefs.js from the gnome shell extensions repository at
 *  git.gnome.org/browse/gnome-shell-extensions
 */

const GObject = imports.gi.GObject;
const Gio = imports.gi.Gio;
const Gtk = imports.gi.Gtk;
const Lang = imports.lang;
const Params = imports.misc.params;
const Me = imports.misc.extensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;

const ENGINES_KEY = 'search-engines';
const SUGGESTIONS_KEY = 'enable-suggestions';
const SUGGESTIONS_DELAY_KEY = 'suggestions-delay';
const HELPER_KEY = 'enable-duckduckgo-helper';
const HELPER_DELAY_KEY = 'helper-delay';
const HELPER_POSITION_KEY = 'helper-position';
const OPEN_URL_KEY = 'open-url-keyword';
const OPEN_URL_LABEL = 'open-url-label';
const HISTORY_KEY = 'search-history-data';
const HISTORY_SUGGESTIONS_KEY = 'enable-history-suggestions'
const HISTORY_LIMIT_KEY = 'history-limit';
const DEFAULT_ENGINE_KEY = 'default-search-engine';
const OPEN_SEARCH_DIALOG_KEY = 'open-web-search-dialog';

const WebSearchDialogPrefsGrid = new GObject.Class({
    Name: 'WebSearchDialog.Prefs.Grid',
    GTypeName: 'WebSearchDialogPrefsGrid',
    Extends: Gtk.Grid,

    _init: function(settings, params) {
        this.parent(params);
        this._settings = settings;
        this.margin = this.row_spacing = this.column_spacing = 10;
        this._rownum = 0;
    },

    add_entry: function(text, key) {
        let item = new Gtk.Entry({
            hexpand: true
        });
        item.text = this._settings.get_string(key);
        this._settings.bind(key, item, 'text', Gio.SettingsBindFlags.DEFAULT);

        return this.add_row(text, item);
    },

    add_shortcut: function(text, settings_key) {
        let item = new Gtk.Entry({
            hexpand: true
        });
        item.set_text(this._settings.get_strv(settings_key)[0]);
        item.connect('changed', Lang.bind(this, function(entry) {
            let [key, mods] = Gtk.accelerator_parse(entry.get_text());

            if(Gtk.accelerator_valid(key, mods)) {
                let shortcut = Gtk.accelerator_name(key, mods);
                this._settings.set_strv(settings_key, [shortcut]);
            }
        }));

        return this.add_row(text, item);
    },

    add_boolean: function(text, key) {
        let item = new Gtk.Switch({
            active: this._settings.get_boolean(key)
        });
        this._settings.bind(key, item, 'active', Gio.SettingsBindFlags.DEFAULT);

        return this.add_row(text, item);
    },

    add_combo: function(text, key, list) {
        let item = new Gtk.ComboBoxText();

        for(let i = 0; i < list.length; i++) {
            let title = list[i].title.trim();
            let id = list[i].value.toString();
            item.insert(-1, id, title);
        }

        item.set_active_id(this._settings.get_int(key).toString());
        item.connect('changed', Lang.bind(this, function(combo) {
            let value = parseInt(combo.get_active_id(), 10);

            if(this._settings.get_int(key) !== value) {
                this._settings.set_int(key, value);
            }
        }));

        this.add_row(text, item);
    },

    add_spin: function(label, key, adjustment_properties, spin_properties) {
        adjustment_properties = Params.parse(adjustment_properties, {
            lower: 0,
            upper: 100,
            step_increment: 100
        });
        let adjustment = new Gtk.Adjustment(adjustment_properties);

        spin_properties = Params.parse(spin_properties, {
            adjustment: adjustment,
            numeric: true,
            snap_to_ticks: true
        }, true);
        let spin_button = new Gtk.SpinButton(spin_properties);

        spin_button.set_value(this._settings.get_int(key));
        spin_button.connect('value-changed', Lang.bind(this, function(spin) {
            let value = spin.get_value_as_int();

            if(this._settings.get_int(key) !== value) {
                this._settings.set_int(key, value);
            }
        }));

        return this.add_row(label, spin_button, true);
    },

    add_row: function(text, widget, wrap) {
        let label = new Gtk.Label({
            label: text,
            hexpand: true,
            halign: Gtk.Align.START
        });
        label.set_line_wrap(wrap || false);

        this.attach(label, 0, this._rownum, 1, 1); // col, row, colspan, rowspan
        this.attach(widget, 1, this._rownum, 1, 1);
        this._rownum++;

        return widget;
    },

    add_item: function(widget, col, colspan, rowspan) {
        this.attach(
            widget,
            col || 0,
            this._rownum,
            colspan || 2,
            rowspan || 1
        );
        this._rownum++;

        return widget;
    }
});

const WebSearchDialogPrefsEnginesList = new GObject.Class({
    Name: 'WebSearchDialog.Prefs.EnginesList',
    GTypeName: 'WebSearchDialogPrefsEnginesList',
    Extends: Gtk.Box,

    _init: function(settings, params) {
        this.parent(params);
        this._settings = settings;
        this._settings.connect('changed', Lang.bind(this, this._refresh));
        this.set_orientation(Gtk.Orientation.VERTICAL);

        this.columns = {
            DISPLAY_NAME: 0,
            KEYWORD: 1,
            URL: 2
        };

        let engines_list_box = new Gtk.Box({
            spacing: 30,
            margin_left: 10,
            margin_top: 10,
            margin_right: 10
        });

        this._store = new Gtk.ListStore();
        this._store.set_column_types([
            GObject.TYPE_STRING,
            GObject.TYPE_STRING,
            GObject.TYPE_STRING
        ]);

        this._tree_view = new Gtk.TreeView({
            model: this._store,
            hexpand: true,
            vexpand: true
        });
        this._tree_view.get_selection().set_mode(Gtk.SelectionMode.SINGLE);

        //engine name
        let name_column = new Gtk.TreeViewColumn({
            expand: true,
            sort_column_id: this.columns.DISPLAY_NAME,
            title: 'Name'
        });

        let name_renderer = new Gtk.CellRendererText();
        name_column.pack_start(name_renderer, true);
        name_column.add_attribute(
            name_renderer,
            "text",
            this.columns.DISPLAY_NAME
        );
        this._tree_view.append_column(name_column);

        //engine keyword
        let keyword_column = new Gtk.TreeViewColumn({
            title: 'Keyword',
            sort_column_id: this.columns.KEYWORD
        });
        let keyword_renderer = new Gtk.CellRendererText();
        keyword_column.pack_start(keyword_renderer, true);
        keyword_column.add_attribute(
            keyword_renderer,
            "text",
            this.columns.KEYWORD
        );
        this._tree_view.append_column(keyword_column);

        //engine url
        let url_column = new Gtk.TreeViewColumn({
            title: 'Url',
            sort_column_id: this.columns.URL
        });
        let url_renderer = new Gtk.CellRendererText();
        url_column.pack_start(url_renderer, true);
        url_column.add_attribute(
            url_renderer,
            "text",
            this.columns.URL
        );
        this._tree_view.append_column(url_column);

        engines_list_box.add(this._tree_view);

        // buttons
        let toolbar = new Gtk.Toolbar({
            hexpand: true,
            margin_left: 10,
            margin_top: 10,
            margin_right: 10
        });
        toolbar.get_style_context().add_class(
            Gtk.STYLE_CLASS_INLINE_TOOLBAR
        );

        let new_button = new Gtk.ToolButton({
            stock_id: Gtk.STOCK_NEW,
            label: 'Add search engine',
            is_important: true
        });
        new_button.connect('clicked',
            Lang.bind(this, this._create_new)
        );
        toolbar.add(new_button);

        let delete_button = new Gtk.ToolButton({
            stock_id: Gtk.STOCK_DELETE
        });
        delete_button.connect('clicked',
            Lang.bind(this, this._delete_selected)
        );
        toolbar.add(delete_button);

        this.add(engines_list_box);
        this.add(toolbar);

        this._changed_permitted = true;
        this._refresh();
    },

    _create_new: function() {
        let dialog = new Gtk.Dialog({
            title: 'Add new search engine',
            transient_for: this.get_toplevel(),
            modal: true
        });
        dialog.add_button(
            Gtk.STOCK_CANCEL,
            Gtk.ResponseType.CANCEL
        );
        dialog.add_button(
            Gtk.STOCK_ADD,
            Gtk.ResponseType.OK
        );
        dialog.set_default_response(
            Gtk.ResponseType.OK
        );

        let grid = new Gtk.Grid({
            column_spacing: 10,
            row_spacing: 15,
            margin: 10
        });

        // Name
        grid.attach(new Gtk.Label({ label: 'Name:' }), 0, 0, 1, 1);
        dialog._engine_name = new Gtk.Entry({
            hexpand: true
        });
        grid.attach(dialog._engine_name, 1, 0, 1, 1);

        // Keyword
        grid.attach(new Gtk.Label({ label: 'Keyword:' }), 0, 1, 1, 1);
        dialog._engine_keyword = new Gtk.Entry({
            hexpand: true
        });
        grid.attach(dialog._engine_keyword, 1, 1, 1, 1);

        // Url
        grid.attach(new Gtk.Label({ label: 'Url:' }), 0, 2, 1, 1);
        dialog._engine_url = new Gtk.Entry({
            hexpand: true
        });
        grid.attach(dialog._engine_url, 1, 2, 1, 1);

        dialog.get_content_area().add(grid);

        dialog.connect('response', Lang.bind(this, function(dialog, id) {
            if(id != Gtk.ResponseType.OK) {
                dialog.destroy();
                return;
            }

            let name = dialog._engine_name.get_text();
            let keyword = dialog._engine_keyword.get_text();
            let url = dialog._engine_url.get_text();
            let new_item = {
                name: name,
                keyword: keyword,
                url: url
            };

            if(!this._append_item(new_item)) {
                return;
            }

            dialog.destroy();
        }));

        dialog.show_all();
    },

    _delete_selected: function() {
        let [any, model, iter] = 
            this._tree_view.get_selection().get_selected();

        if(any) {
            let name = this._store.get_value(iter, this.columns.DISPLAY_NAME);
            this._remove_item(name);
            this._store.remove(iter);
        }
    },

    _refresh: function() {
        this._store.clear();

        let current_items = this._settings.get_strv(ENGINES_KEY);
        let valid_items = [];

        for(let i = 0; i < current_items.length; i++) {
            let item = JSON.parse(current_items[i]);

            if(this._is_valid_item(item)) {
                valid_items.push(current_items[i]);
                let iter = this._store.append();
                this._store.set(iter,
                    [this.columns.DISPLAY_NAME, this.columns.KEYWORD, this.columns.URL],
                    [item.name, item.keyword, item.url]
                );
            }
        }

        if(valid_items.length != current_items.length) {
            // some items were filtered out
            this._settings.set_strv(ENGINES_KEY, valid_items);
        }
    },

    _is_valid_item: function(item) {
        if(Utils.is_blank(item.name)) {
            return false;
        }
        else if(Utils.is_blank(item.keyword)) {
            return false;
        }
        else if(Utils.is_blank(item.url)) {
            return false;
        }
        else {
            return true;
        }
    },

    _append_item: function(new_item) {
        if(!this._is_valid_item(new_item)) {
            return false;
        }

        let current_items = this._settings.get_strv(ENGINES_KEY);

        for(let i = 0; i < current_items.length; i++) {
            let info = JSON.parse(current_items[i]);

            if(info.name == new_item.name) {
                printerr("Already have an item for this name");
                this._show_error('sda');
                return false;
            }
            else if(info.keyword == new_item.keyword) {
                printerr("Already have an item for this keyword");
                return false;
            }
        }

        current_items.push(JSON.stringify(new_item));
        this._settings.set_strv(ENGINES_KEY, current_items);
        return true;
    },

    _remove_item: function(name) {
        if(Utils.is_blank(name)) {
            return false;
        }

        let current_items = this._settings.get_strv(ENGINES_KEY);
        let result = null;

        for(let i = 0; i < current_items.length; i++) {
            let info = JSON.parse(current_items[i]);

            if(info.name == name) {
                current_items.splice(i, 1);
                result = true;
                break;
            }
        }

        this._settings.set_strv(ENGINES_KEY, current_items);
        return result;
    }
});

const WebSearchDialogPrefsWidget = new GObject.Class({
    Name: 'WebSearchDialog.Prefs.Widget',
    GTypeName: 'WebSearchDialogPrefsWidget',
    Extends: Gtk.Box,

    _init: function(params) {
        this.parent(params);
        this._settings = Utils.getSettings();

        let settings_grid = new WebSearchDialogPrefsGrid(this._settings);
        let settings_grid_label = new Gtk.Label({
            label: "Settings"
        });

        // default engine
        let engines_list = this._settings.get_strv(ENGINES_KEY);
        let result_list = [];

        for(let i = 0; i < engines_list.length; i++) {
            let info = JSON.parse(engines_list[i]);
            let result = {
                title: info.name,
                value: i
            };
            result_list.push(result);
        }

        let default_engine = settings_grid.add_combo(
            'Default search engine:',
            DEFAULT_ENGINE_KEY,
            result_list
        );

        // suggestions
        let enable_suggestions = settings_grid.add_boolean(
            'Suggestions:',
            SUGGESTIONS_KEY
        );

        // suggestions delay
        let suggestions_delay_adjustment = {
            lower: 100,
            upper: 1000,
            step_increment: 10
        };
        let suggestions_delay = settings_grid.add_spin(
            'Suggestions delay(ms):',
            SUGGESTIONS_DELAY_KEY,
            suggestions_delay_adjustment
        );

        // helper
        let enable_helper = settings_grid.add_boolean(
            'Duckduckgo.com helper:',
            HELPER_KEY
        );

        // helper delay
        let helper_delay_adjustment = {
            lower: 250,
            upper: 2000,
            step_increment: 10
        };
        let helper_delay = settings_grid.add_spin(
            'Helper delay(ms):',
            HELPER_DELAY_KEY,
            helper_delay_adjustment
        );

        // helper position
        let helper_position = settings_grid.add_entry(
            'Helper position(top or bottom):',
            HELPER_POSITION_KEY
        );

        // history suggestions
        let enable_history_suggestions = settings_grid.add_boolean(
            'History suggestions:',
            HISTORY_SUGGESTIONS_KEY
        );

        // history limit
        let history_limit_adjustment = {
            lower: 10,
            upper: 1000,
            step_increment: 5
        }
        let history_limit = settings_grid.add_spin(
            'History limit:',
            HISTORY_LIMIT_KEY,
            history_limit_adjustment
        );

        // open url keyword
        let open_url_keyword = settings_grid.add_entry(
            'Open url keyword(empty to disable):',
            OPEN_URL_KEY
        );

        // open url label
        let open_url_label = settings_grid.add_entry(
            'Open url label:',
            OPEN_URL_LABEL
        );

        let engines_list = new WebSearchDialogPrefsEnginesList(this._settings);
        let engines_list_label = new Gtk.Label({
            label: "Search engines"
        });

        let shortcuts = new WebSearchDialogPrefsGrid(this._settings);
        shortcuts.add_shortcut('Open search dialog:', OPEN_SEARCH_DIALOG_KEY);
        let shortcuts_label = new Gtk.Label({
            label: "Keyboard shortcuts"
        });

        let notebook = new Gtk.Notebook({
            margin_left: 5,
            margin_top: 5,
            margin_bottom: 5,
            margin_right: 5
        });

        notebook.append_page(settings_grid, settings_grid_label);
        notebook.append_page(engines_list, engines_list_label);
        notebook.append_page(shortcuts, shortcuts_label);

        this.add(notebook);
    }
});

function init(){
    // nothing
}

function buildPrefsWidget() {
    let widget = new WebSearchDialogPrefsWidget();
    widget.show_all();

    return widget;
}
