/*
    Copyright 2017 Ivan awamper@gmail.com

    This program is free software; you can redistribute it and/or
    modify it under the terms of the GNU General Public License as
    published by the Free Software Foundation; either version 2 of
    the License, or (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program. If not, see <http://www.gnu.org/licenses/>.
*/

const GObject = imports.gi.GObject;
const Gio = imports.gi.Gio;
const Gtk = imports.gi.Gtk;
const Lang = imports.lang;
const Params = imports.misc.params;
const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;

var ENGINES_KEY = 'search-engines';
var SUGGESTIONS_KEY = 'enable-suggestions';
var SUGGESTIONS_DELAY_KEY = 'suggestions-delay';
var HELPER_KEY = 'enable-duckduckgo-helper';
var HELPER_DELAY_KEY = 'helper-delay';
var HELPER_POSITION_KEY = 'helper-position';
var OPEN_URL_KEY = 'open-url-keyword';
var OPEN_URL_LABEL = 'open-url-label';
var HISTORY_KEY = 'search-history-data';
var HISTORY_SUGGESTIONS_KEY = 'enable-history-suggestions'
var HISTORY_LIMIT_KEY = 'history-limit';
var DEFAULT_ENGINE_KEY = 'default-search-engine';
var OPEN_SEARCH_DIALOG_KEY = 'open-web-search-dialog';
var SELECT_FIRST_SUGGESTION = 'select-first-suggestion';


const KeybindingsWidget = new GObject.Class({
    Name: 'Keybindings.Widget',
    GTypeName: 'KeybindingsWidget',
    Extends: Gtk.Box,

    _init: function(keybindings, settings) {
        this.parent();
        this.set_orientation(Gtk.Orientation.VERTICAL);

        this._settings = settings;
        this._keybindings = keybindings;

        let scrolled_window = new Gtk.ScrolledWindow();
        scrolled_window.set_policy(
            Gtk.PolicyType.AUTOMATIC,
            Gtk.PolicyType.AUTOMATIC
        );

        this._columns = {
            NAME: 0,
            ACCEL_NAME: 1,
            MODS: 2,
            KEY: 3
        };

        this._store = new Gtk.ListStore();
        this._store.set_column_types([
            GObject.TYPE_STRING,
            GObject.TYPE_STRING,
            GObject.TYPE_INT,
            GObject.TYPE_INT
        ]);

        this._tree_view = new Gtk.TreeView({
            model: this._store,
            hexpand: true,
            vexpand: true
        });
        this._tree_view.get_selection().set_mode(Gtk.SelectionMode.SINGLE);

        let action_renderer = new Gtk.CellRendererText();
        let action_column = new Gtk.TreeViewColumn({
            'title': 'Action',
            'expand': true
        });
        action_column.pack_start(action_renderer, true);
        action_column.add_attribute(action_renderer, 'text', 1);
        this._tree_view.append_column(action_column);

        let keybinding_renderer = new Gtk.CellRendererAccel({
            'editable': true,
            'accel-mode': Gtk.CellRendererAccelMode.GTK
        });
        keybinding_renderer.connect('accel-edited',
            Lang.bind(this, function(renderer, iter, key, mods) {
                let value = Gtk.accelerator_name(key, mods);
                let [success, iterator ] =
                    this._store.get_iter_from_string(iter);

                if(!success) {
                    printerr("Can't change keybinding");
                }

                let name = this._store.get_value(iterator, 0);

                this._store.set(
                    iterator,
                    [this._columns.MODS, this._columns.KEY],
                    [mods, key]
                );
                this._settings.set_strv(name, [value]);
            })
        );

        let keybinding_column = new Gtk.TreeViewColumn({
            'title': 'Modify'
        });
        keybinding_column.pack_end(keybinding_renderer, false);
        keybinding_column.add_attribute(
            keybinding_renderer,
            'accel-mods',
            this._columns.MODS
        );
        keybinding_column.add_attribute(
            keybinding_renderer,
            'accel-key',
            this._columns.KEY
        );
        this._tree_view.append_column(keybinding_column);

        scrolled_window.add(this._tree_view);
        this.add(scrolled_window);

        this._refresh();
    },

    _refresh: function() {
        this._store.clear();

        for(let settings_key in this._keybindings) {
            let [key, mods] = Gtk.accelerator_parse(
                this._settings.get_strv(settings_key)[0]
            );

            let iter = this._store.append();
            this._store.set(iter,
                [
                    this._columns.NAME,
                    this._columns.ACCEL_NAME,
                    this._columns.MODS,
                    this._columns.KEY
                ],
                [
                    settings_key,
                    this._keybindings[settings_key],
                    mods,
                    key
                ]
            );
        }
    }
});


const PrefsGrid = new GObject.Class({
    Name: 'Prefs.Grid',
    GTypeName: 'PrefsGrid',
    Extends: Gtk.Grid,

    _init: function(settings, params) {
        this.parent(params);
        this._settings = settings;
        this.margin = this.row_spacing = this.column_spacing = 10;
        this._rownum = 0;
    },

    add_entry: function(text, key) {
        let item = new Gtk.Entry({
            hexpand: false
        });
        item.text = this._settings.get_string(key);
        this._settings.bind(key, item, 'text', Gio.SettingsBindFlags.DEFAULT);

        return this.add_row(text, item);
    },

    add_shortcut: function(text, settings_key) {
        let item = new Gtk.Entry({
            hexpand: false
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

    add_combo: function(text, key, list, type) {
        let item = new Gtk.ComboBoxText();

        for(let i = 0; i < list.length; i++) {
            let title = list[i].title.trim();
            let id = list[i].value.toString();
            item.insert(-1, id, title);
        }

        if(type === 'string') {
            item.set_active_id(this._settings.get_string(key));
        }
        else {
            item.set_active_id(this._settings.get_int(key).toString());
        }

        item.connect('changed', Lang.bind(this, function(combo) {
            let value = combo.get_active_id();

            if(type === 'string') {
                if(this._settings.get_string(key) !== value) {
                    this._settings.set_string(key, value);
                }
            }
            else {
                value = parseInt(value, 10);

                if(this._settings.get_int(key) !== value) {
                    this._settings.set_int(key, value);
                }
            }
        }));

        return this.add_row(text, item);
    },

    add_spin: function(label, key, adjustment_properties, type, spin_properties) {
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

        if(type !== 'int') spin_button.set_digits(2);

        let get_method = type === 'int' ? 'get_int' : 'get_double';
        let set_method = type === 'int' ? 'set_int' : 'set_double';

        spin_button.set_value(this._settings[get_method](key));
        spin_button.connect('value-changed', Lang.bind(this, function(spin) {
            let value

            if(type === 'int') value = spin.get_value_as_int();
            else value = spin.get_value();

            if(this._settings[get_method](key) !== value) {
                this._settings[set_method](key, value);
            }
        }));

        return this.add_row(label, spin_button, true);
    },

    add_button: function(label, callback) {
        let item = new Gtk.Button({
            label: label
        });
        item.connect('clicked', callback);

        return this.add_item(item);
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
    },

    add_range: function(label, key, range_properties) {
        range_properties = Params.parse(range_properties, {
            min: 0,
            max: 100,
            step: 10,
            mark_position: 0,
            add_mark: false,
            size: 200,
            draw_value: true
        });

        let range = Gtk.Scale.new_with_range(
            Gtk.Orientation.HORIZONTAL,
            range_properties.min,
            range_properties.max,
            range_properties.step
        );
        range.set_value(this._settings.get_int(key));
        range.set_draw_value(range_properties.draw_value);

        if(range_properties.add_mark) {
            range.add_mark(
                range_properties.mark_position,
                Gtk.PositionType.BOTTOM,
                null
            );
        }

        range.set_size_request(range_properties.size, -1);

        range.connect('value-changed', Lang.bind(this, function(slider) {
            this._settings.set_int(key, slider.get_value());
        }));

        label = new Gtk.Label({
            label: label,
            hexpand: true,
            halign: Gtk.Align.START
        });
        label.set_line_wrap(false);

        let box = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL
        });
        box.pack_start(label, true, false, 0);
        box.pack_start(range, true, false, 0);

        return this.add_item(box);
    },

    add_separator: function() {
        let separator = new Gtk.Separator({
            orientation: Gtk.Orientation.HORIZONTAL
        });

        this.add_item(separator, 0, 2, 1);
    },

    add_levelbar: function(params) {
        params = Params.parse(params, {
            min_value: 0,
            max_value: 100,
            value: 0,
            mode: Gtk.LevelBarMode.CONTINUOUS,
            inverted: false
        });
        let item = new Gtk.LevelBar(params);
        return this.add_item(item);
    },

    add_label: function(text, markup=null) {
        let label = new Gtk.Label({
            hexpand: true,
            halign: Gtk.Align.START
        });
        label.set_line_wrap(true);

        if(markup) label.set_markup(markup);
        else label.set_text(text);

        return this.add_item(label);
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
        let name_renderer = new Gtk.CellRendererText({ editable: true });
        name_renderer.connect('edited', this._make_on_item_edited('name'));
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
        let keyword_renderer = new Gtk.CellRendererText({ editable: true });
        keyword_renderer.connect('edited', this._make_on_item_edited('keyword'));
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
        let url_renderer = new Gtk.CellRendererText({ editable: true });
        url_renderer.connect('edited', this._make_on_item_edited('url'));
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

        let scrolled_window = new Gtk.ScrolledWindow();
        scrolled_window.add(engines_list_box);

        this.add(scrolled_window);
        this.add(toolbar);

        this._changed_permitted = true;
        this._refresh();
    },

    _make_on_item_edited: function (column) {
        return Lang.bind(this, function (renderer, rowIndex, newVal) {
            let [any, model, iter] = this._tree_view.get_selection().get_selected();
            let name = this._store.get_value(iter, this.columns.DISPLAY_NAME);
            let update = {};
            update[column] = newVal;
            return this._update_item(name, update);
        });
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

    _is_duplicate_item: function(item, ignoreIndex) {
        let current_items = this._settings.get_strv(ENGINES_KEY);

        for(let i = 0; i < current_items.length; i++) {
            if (i === ignoreIndex) continue;

            let info = JSON.parse(current_items[i]);

            if(info.name == item.name) {
                printerr("Already have an item for this name");
                return false;
            }
            else if(info.keyword == item.keyword) {
                printerr("Already have an item for this keyword");
                return false;
            }
        }

        return true;
    },

    _append_item: function(new_item) {
        if(!this._is_valid_item(new_item) || !this._is_duplicate_item(new_item)) {
            return false;
        }

        let current_items = this._settings.get_strv(ENGINES_KEY);

        current_items.push(JSON.stringify(new_item));
        this._settings.set_strv(ENGINES_KEY, current_items);
        return true;
    },

    _update_item: function(name, update) {
        let current_items = this._settings.get_strv(ENGINES_KEY);

        for(let i = 0; i < current_items.length; i++) {
            let info = JSON.parse(current_items[i]);

            if(info.name == name) {
                for (let key of Object.keys(update)) {
                    info[key] = update[key];
                }

                if(!this._is_valid_item(info) || !this._is_duplicate_item(info, i)) {
                    return false;
                }

                current_items[i] = JSON.stringify(info);
                this._settings.set_strv(ENGINES_KEY, current_items);
                return true;
            }
        }

        return false;
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
        this.set_orientation(Gtk.Orientation.VERTICAL);
        this._settings = Utils.getSettings();

        let main = this._get_main_page();
        let keybindings = this._get_keybindings_page();

        let settings_grid = new PrefsGrid(this._settings);
        let settings_grid_label = new Gtk.Label({
            label: "Settings"
        });

        let engines = {
            page: new WebSearchDialogPrefsEnginesList(this._settings),
            name: 'Search engines'
        }

        let stack = new Gtk.Stack({
            transition_type: Gtk.StackTransitionType.SLIDE_LEFT_RIGHT,
            transition_duration: 500
        });
        let stack_switcher = new Gtk.StackSwitcher({
            margin_left: 5,
            margin_top: 5,
            margin_bottom: 5,
            margin_right: 5,
            stack: stack
        });
        stack.add_titled(main.page, main.name, main.name);
        stack.add_titled(engines.page, engines.name, engines.name);
        stack.add_titled(keybindings.page, keybindings.name, keybindings.name);

        this.add(stack);

        this.connect('realize',
            Lang.bind(this, function() {
                let headerbar = this.get_toplevel().get_titlebar();
                headerbar.set_custom_title(stack_switcher);
                headerbar.show_all();
                this.get_toplevel().resize(700, 250);
            })
        );
    },

    _get_main_page: function() {
        let settings = Utils.getSettings();
        let name = 'Main';
        let page = new PrefsGrid(settings);

        let spin_properties = {
            lower: 0,
            upper: 0,
            step_increment: 0
        };

        let engine_list = this._settings.get_strv(ENGINES_KEY);
        let result_list = [];

        for(let i = 0; i < engine_list.length; i++) {
            let info = JSON.parse(engine_list[i]);
            let result = {
                title: info.name,
                value: i
            };
            result_list.push(result);
        }

        page.add_combo(
            'Default search engine:',
            DEFAULT_ENGINE_KEY,
            result_list,
            'int'
        );

        page.add_separator();

        page.add_boolean(
            'Duckduckgo.com helper:',
            HELPER_KEY
        );
        page.add_boolean(
            'Suggestions:',
            SUGGESTIONS_KEY
        );
        page.add_boolean(
            'Autocomplete with first suggestion:',
            SELECT_FIRST_SUGGESTION
        );
        page.add_boolean(
            'History suggestions:',
            HISTORY_SUGGESTIONS_KEY
        );

        page.add_separator();

        spin_properties.lower = 10;
        spin_properties.upper = 1000;
        spin_properties.step_increment = 5;
        page.add_spin(
            'History limit:',
            HISTORY_LIMIT_KEY,
            spin_properties,
            'int'
        );

        spin_properties.lower = 200;
        spin_properties.upper = 1000;
        spin_properties.step_increment = 100;
        page.add_spin(
            'Suggestions delay(ms):',
            SUGGESTIONS_DELAY_KEY,
            spin_properties,
            'int'
        );

        spin_properties.lower = 250;
        spin_properties.upper = 2000;
        spin_properties.step_increment = 50;
        page.add_spin(
            'Helper delay(ms):',
            HELPER_DELAY_KEY,
            spin_properties,
            'int'
        );

        let options = [
            {title: 'Top', value: 'top'},
            {title: 'Bottom', value: 'bottom'}
        ];
        page.add_combo(
            'Helper position(top or bottom):',
            HELPER_POSITION_KEY,
            options,
            'string'
        );

        page.add_separator();

        page.add_entry(
            'Open url keyword(empty to disable):',
            OPEN_URL_KEY
        );
        page.add_entry(
            'Open url label:',
            OPEN_URL_LABEL
        );

        return {
            page: page,
            name: name
        };
    },

    _get_keybindings_page: function() {
        let settings = Utils.getSettings();
        let name = 'Keybindings';
        let page = new PrefsGrid(settings);

        let keybindings = {};
        keybindings[OPEN_SEARCH_DIALOG_KEY] = 'Open search dialog:';

        let keybindings_widget = new KeybindingsWidget(keybindings, settings);
        page.add_item(keybindings_widget)

        return {
            page: page,
            name: name
        };
    },
});


function init(){
    // nothing
}


function buildPrefsWidget() {
    let widget = new WebSearchDialogPrefsWidget();
    widget.show_all();

    return widget;
}
