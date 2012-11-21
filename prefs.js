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
const Convenience = Me.imports.convenience;

const ENGINES_KEY = 'search-engines';
const SUGGESTIONS_KEY = 'enable-suggestions';
const OPEN_URL_KEY = 'open-url-keyword';
const HISTORY_KEY = 'search-history';
const HISTORY_SUGGESTIONS_KEY = 'enable-history-suggestions'
const HISTORY_LIMIT_KEY = 'history-limit';
const DEFAULT_ENGINE_KEY = 'default-search-engine';

const Columns = {
    DISPLAY_NAME: 0,
    KEYWORD: 1,
    URL: 2
};

const WebSearchPrefsWidget = new GObject.Class({
    Name: 'WebSearch.Prefs.Widget',
    GTypeName: 'WebSearchPrefsWidget',
    Extends: Gtk.Grid,

    _init: function(params) {
        this.parent(params);
        this.set_orientation(Gtk.Orientation.VERTICAL);

        this._settings = Convenience.getSettings();
        this._settings.connect('changed', Lang.bind(this, this._refresh));
        this._changed_permitted = false;

        // suggestions
        let enable_suggestions_label = new Gtk.Label({
            label: "Enable suggestions:", 
            xalign: 0,
            hexpand:true
        });
        let enable_suggestions_switch = new Gtk.Switch({
            halign: Gtk.Align.END
        });
        enable_suggestions_switch.set_active(
            this._settings.get_boolean(SUGGESTIONS_KEY)
        );
        enable_suggestions_switch.connect(
            "notify::active",
            Lang.bind(this, function(check) {
                this._settings.set_boolean(SUGGESTIONS_KEY, check.get_active());
            })
        );
        let enable_suggestions_box = new Gtk.Box({
            spacing: 30,
            margin_left: 10,
            margin_top: 10,
            margin_right: 10
        });
        enable_suggestions_box.add(enable_suggestions_label);
        enable_suggestions_box.add(enable_suggestions_switch);
        this.add(enable_suggestions_box);

        // history suggestions
        let enable_history_suggestions_label = new Gtk.Label({
            label: "Enable history suggestions:", 
            xalign: 0,
            hexpand:true
        });
        let enable_history_suggestions_switch = new Gtk.Switch({
            halign: Gtk.Align.END
        });
        enable_history_suggestions_switch.set_active(
            this._settings.get_boolean(HISTORY_SUGGESTIONS_KEY)
        );
        enable_history_suggestions_switch.connect(
            "notify::active",
            Lang.bind(this, function(check) {
                this._settings.set_boolean(
                    HISTORY_SUGGESTIONS_KEY,
                    check.get_active()
                );
            })
        );
        let enable_history_suggestions_box = new Gtk.Box({
            spacing: 30,
            margin_left: 10,
            margin_top: 10,
            margin_right: 10
        });
        enable_history_suggestions_box.add(enable_history_suggestions_label);
        enable_history_suggestions_box.add(enable_history_suggestions_switch);
        this.add(enable_history_suggestions_box);

        // history limit
        let history_limit_label = new Gtk.Label({
            label: "History limit:", 
            xalign: 0,
            hexpand:true
        });

        let adjustment = new Gtk.Adjustment({
            lower: 10,
            upper: 1000,
            step_increment: 5
        });
        let spin_button = new Gtk.SpinButton({
            adjustment: adjustment,
            numeric: true,
            snap_to_ticks: true
        });

        spin_button.set_value(this._settings.get_int(HISTORY_LIMIT_KEY));
        spin_button.connect('value-changed', Lang.bind(this, function (spin) {
            let value = spin.get_value_as_int();

            if(this._settings.get_int(HISTORY_LIMIT_KEY) !== value) {
                this._settings.set_int(HISTORY_LIMIT_KEY, value);
            }
        }));
        let history_limit_box = new Gtk.Box({
            spacing: 30,
            margin_left: 10,
            margin_top: 10,
            margin_right: 10
        });
        history_limit_box.add(history_limit_label);
        history_limit_box.add(spin_button);
        this.add(history_limit_box);


        // open url
        let open_url_label = new Gtk.Label({
            label: 'Open URL Keyword(empty to disable):',
            hexpand: true,
            halign: Gtk.Align.START
        });

        let open_url_entry = new Gtk.Entry({
            hexpand: false
        });
        open_url_entry.text = this._settings.get_string(OPEN_URL_KEY);
        this._settings.bind(
            OPEN_URL_KEY,
            open_url_entry,
            'text',
            Gio.SettingsBindFlags.DEFAULT
        );

        let open_url_box = new Gtk.Box({
            spacing: 30,
            margin_left: 10,
            margin_top: 10,
            margin_right: 10
        });

        open_url_box.add(open_url_label);
        open_url_box.add(open_url_entry);
        this.add(open_url_box);

        // engines
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
            sort_column_id: Columns.DISPLAY_NAME,
            title: 'Search engine'
        });

        let name_renderer = new Gtk.CellRendererText;
        name_column.pack_start(name_renderer, true);
        name_column.add_attribute(
            name_renderer,
            "text",
            Columns.DISPLAY_NAME
        );
        this._tree_view.append_column(name_column);

        //engine keyword
        let keyword_column = new Gtk.TreeViewColumn({
            title: 'Keyword',
            sort_column_id: Columns.KEYWORD
        });
        let keyword_renderer = new Gtk.CellRendererText;
        keyword_column.pack_start(keyword_renderer, true);
        keyword_column.add_attribute(
            keyword_renderer,
            "text",
            Columns.KEYWORD
        );
        this._tree_view.append_column(keyword_column);

        //engine url
        let url_column = new Gtk.TreeViewColumn({
            title: 'Url',
            sort_column_id: Columns.URL
        });
        let url_renderer = new Gtk.CellRendererText;
        url_column.pack_start(url_renderer, true);
        url_column.add_attribute(
            url_renderer,
            "text",
            Columns.URL
        );
        this._tree_view.append_column(url_column);

        engines_list_box.add(this._tree_view);
        this.add(engines_list_box);

        let toolbar = new Gtk.Toolbar({
            hexpand: true,
            margin_left: 10,
            margin_top: 10,
            margin_right: 10
        });
        toolbar.get_style_context().add_class(
            Gtk.STYLE_CLASS_INLINE_TOOLBAR
        );
        this.add(toolbar);

        let new_button = new Gtk.ToolButton({
            stock_id: Gtk.STOCK_NEW,
            label: 'Add search engine',
            is_important: true
        });
        new_button.connect('clicked',
            Lang.bind(this, this._create_new)
        );
        toolbar.add(new_button);

        let del_button = new Gtk.ToolButton({
            stock_id: Gtk.STOCK_DELETE
        });
        del_button.connect('clicked',
            Lang.bind(this, this._delete_selected)
        );
        toolbar.add(del_button);

        this._changed_permitted = true;
        this._refresh();
    },

    _is_valid_item: function(item) {
        if(Convenience.is_blank(item.name)) {
            return false;
        }
        else if(Convenience.is_blank(item.keyword)) {
            return false;
        }
        else if(Convenience.is_blank(item.url)) {
            return false;
        }
        else {
            return true;
        }
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
            'Add',
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
            if (id != Gtk.ResponseType.OK) {
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

            this._changed_permitted = false;

            if (!this._append_item(new_item)) {
                this._changed_permitted = true;
                return;
            }

            let iter = this._store.append();
            this._store.set(iter,
                [Columns.DISPLAY_NAME, Columns.KEYWORD, Columns.URL],
                [name, keyword, url]
            );
            this._changed_permitted = true;

            dialog.destroy();
        }));
        dialog.show_all();
    },

    _delete_selected: function() {
        let [any, model, iter] = 
            this._tree_view.get_selection().get_selected();

        if (any) {
            let name = this._store.get_value(iter, Columns.DISPLAY_NAME);

            this._changed_permitted = false;
            this._remove_item(name);
            this._store.remove(iter);
            this._changed_permitted = true;
        }
    },

    _refresh: function() {
        if (!this._changed_permitted)
            // Ignore this notification, model is being modified outside
            return;

        this._store.clear();

        let current_items = this._settings.get_strv(ENGINES_KEY);
        let valid_items = [];

        for (let i = 0; i < current_items.length; i++) {
            let item = JSON.parse(current_items[i]);

            if(this._is_valid_item(item)) {
                valid_items.push(current_items[i]);
                let iter = this._store.append();
                this._store.set(iter,
                    [Columns.DISPLAY_NAME, Columns.KEYWORD, Columns.URL],
                    [item.name, item.keyword, item.url]
                );
            }
        }

        if (valid_items.length != current_items.length) {
            // some items were filtered out
            this._settings.set_strv(ENGINES_KEY, valid_items);
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
                return false;
            }
        }

        current_items.push(JSON.stringify(new_item));
        this._settings.set_strv(ENGINES_KEY, current_items);
        return true;
    },

    _remove_item: function(name) {
        if(Convenience.is_blank(name)) {
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

function init(){
    // nothing
}

function buildPrefsWidget() {
    let widget = new WebSearchPrefsWidget();
    widget.show_all();

    return widget;
}
