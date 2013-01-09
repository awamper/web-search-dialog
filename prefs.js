/*
 * Credit:
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
const PrefsKeys = Me.imports.prefs_keys;
const SearchEngines = Me.imports.search_engines;

let search_engines = new SearchEngines.SearchEngines();

function get_suggestions_combo() {
    let files_list = Utils.get_files_in_dir(Me.path+'/suggestions')
    let combo = new Gtk.ComboBoxText();

    for(let i = 0; i < files_list.length; i++) {
        let file_name = files_list[i];

        if(!Utils.ends_with(file_name, '_suggestions.js')) continue;

        let title = file_name.slice(0, -15);
        let id = file_name;
        combo.insert(-1, id, title);
    }

    return combo;
}

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

        return this.add_row(text, item);
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

        let scrolled_window = new Gtk.ScrolledWindow();
        scrolled_window.set_policy(Gtk.PolicyType.AUTOMATIC, Gtk.PolicyType.AUTOMATIC);

        this.columns = {
            ID: 0,
            DISPLAY_NAME: 1,
            KEYWORD: 2,
            URL: 3,
            ENABLE_SUGGESTIONS: 4,
            ENABLE_HELPERS: 5,
            SUGGESTIONS_ENGINE: 6
        };

        this._store = new Gtk.ListStore();
        this._store.set_column_types([
            GObject.TYPE_INT,
            GObject.TYPE_STRING,
            GObject.TYPE_STRING,
            GObject.TYPE_STRING,
            GObject.TYPE_BOOLEAN,
            GObject.TYPE_BOOLEAN,
            GObject.TYPE_STRING
        ]);

        this._tree_view = new Gtk.TreeView({
            model: this._store,
            hexpand: true,
            vexpand: true
        });
        this._tree_view.get_selection().set_mode(Gtk.SelectionMode.SINGLE);
        this._tree_view.connect('row-activated', Lang.bind(this, function() {
            this._create_new(null, true);
        }));

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
            expand: false,
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

        scrolled_window.add(this._tree_view);

        // buttons
        let toolbar = new Gtk.Toolbar({
            hexpand: true,
            // margin_left: 10,
            margin_top: 10,
            // margin_right: 10
        });
        toolbar.get_style_context().add_class(
            Gtk.STYLE_CLASS_INLINE_TOOLBAR
        );

        // new button
        let new_button = new Gtk.ToolButton({
            stock_id: Gtk.STOCK_NEW,
            label: 'Add search engine',
            is_important: true
        });
        new_button.connect('clicked',
            Lang.bind(this, this._create_new)
        );
        toolbar.add(new_button);

        // edit button
        let edit_button = new Gtk.ToolButton({
            stock_id: Gtk.STOCK_EDIT,
            label: "Edit"
        });
        edit_button.connect('clicked', Lang.bind(this, function() {
            this._create_new(null, true);
        }));
        toolbar.add(edit_button);

        // delete button
        let delete_button = new Gtk.ToolButton({
            stock_id: Gtk.STOCK_DELETE,
            label: "Remove"
        });
        delete_button.connect('clicked',
            Lang.bind(this, this._delete_selected)
        );
        toolbar.add(delete_button);

        this.add(scrolled_window);
        this.add(toolbar);

        this._refresh();
    },

    _get_helpers_list_box: function(engine_id) {
        let scrolled_window = new Gtk.ScrolledWindow({
            min_content_height: 100
        });
        scrolled_window.set_policy(Gtk.PolicyType.AUTOMATIC, Gtk.PolicyType.AUTOMATIC);

        let grid = new Gtk.Grid({
            column_spacing: 2,
            row_spacing: 2,
            margin: 10
        });

        let files_list = Utils.get_files_in_dir(Me.path+'/helpers')
        this._helpers_list = [];

        let engine = search_engines.get_engine_by_property(engine_id, 'id');

        for(let i = 0; i < files_list.length; i++) {
            let file_name = files_list[i];

            if(!Utils.ends_with(file_name, '_helper.js')) continue;

            let name = new Gtk.Label({
                label: files_list[i].slice(0, -10),
                hexpand: true,
                halign: Gtk.Align.START
            });
            let check = new Gtk.Switch();

            if(engine && engine.allowed_helpers.indexOf(file_name) != -1) {
                check.set_active(true);
            }

            grid.attach(name, 0, i, 1, 1);
            grid.attach(check, 1, i, 1, 1);

            this._helpers_list.push({
                file_name: file_name,
                check: check
            });
        }

        scrolled_window.add_with_viewport(grid);
        return scrolled_window;
    },

    _create_new: function(object, edit) {
        let exists_id = 0;
        let exists_name = '';
        let exists_keyword = '';
        let exists_url = '';
        let enable_suggestions = true;
        let enable_helpers = true;
        let exists_suggestions_engine = 'default';

        if(edit === true) {
            let [any, model, iter] = 
                this._tree_view.get_selection().get_selected();

            if(any) {
                exists_id = this._store.get_value(iter, this.columns.ID);
                exists_name = this._store.get_value(iter, this.columns.DISPLAY_NAME);
                exists_keyword = this._store.get_value(iter, this.columns.KEYWORD);
                exists_url = this._store.get_value(iter, this.columns.URL);
                exists_suggestions_engine =
                    this._store.get_value(iter, this.columns.SUGGESTIONS_ENGINE);
                enable_suggestions =
                    this._store.get_value(iter, this.columns.ENABLE_SUGGESTIONS);
                enable_helpers =
                    this._store.get_value(iter, this.columns.ENABLE_HELPERS);
            }
        }

        let dialog = new Gtk.Dialog({
            transient_for: this.get_toplevel(),
            modal: true
        });
        dialog.set_default_size(500, 300);
        dialog.add_button(
            Gtk.STOCK_CANCEL,
            Gtk.ResponseType.CANCEL
        );
        dialog.add_button(
            Gtk.STOCK_SAVE,
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
        grid.attach(new Gtk.Label({label: 'Name:'}), 0, 0, 1, 1);
        dialog._engine_name = new Gtk.Entry({
            text: exists_name,
            hexpand: true
        });
        grid.attach(dialog._engine_name, 1, 0, 1, 1);

        // Keyword
        grid.attach(new Gtk.Label({ label: 'Keyword:' }), 0, 1, 1, 1);
        dialog._engine_keyword = new Gtk.Entry({
            text: exists_keyword,
            hexpand: true
        });
        grid.attach(dialog._engine_keyword, 1, 1, 1, 1);

        // Url
        grid.attach(new Gtk.Label({ label: 'Url:' }), 0, 2, 1, 1);
        dialog._engine_url = new Gtk.Entry({
            text: exists_url,
            hexpand: true
        });
        grid.attach(dialog._engine_url, 1, 2, 1, 1);

        // helpers list
        dialog._helpers_list_box = this._get_helpers_list_box(exists_id);
        dialog._helpers_list_expander = new Gtk.Expander({
            label: 'Helpers'
        });
        dialog._helpers_list_expander.set_sensitive(enable_helpers);
        dialog._helpers_list_expander.set_expanded(enable_helpers);
        dialog._helpers_list_expander.add(dialog._helpers_list_box);
        grid.attach(dialog._helpers_list_expander, 1, 4, 1, 1);

        // enable helpers
        grid.attach(new Gtk.Label({label: 'Enable helpers:' }), 0, 3, 1, 1);
        dialog._enable_helpers = new Gtk.Switch({
            active: enable_helpers
        });
        dialog._enable_helpers.connect('notify::active',
            Lang.bind(this, function(s) {
                let active = s.get_active();
                if(active) {
                    dialog._helpers_list_expander.set_sensitive(true);
                    dialog._helpers_list_expander.set_expanded(true);
                }
                else {
                    dialog._helpers_list_expander.set_sensitive(false);
                    dialog._helpers_list_expander.set_expanded(false)
                }
            })
        );
        grid.attach(dialog._enable_helpers, 1, 3, 1, 1);

        // Suggestions engine
        grid.attach(new Gtk.Label({label: 'Suggestion engine:' }), 0, 6, 1, 1);
        dialog._suggestions_combo = get_suggestions_combo();
        dialog._suggestions_combo.insert(-1, 'default', 'Default');
        dialog._suggestions_combo.set_active_id(exists_suggestions_engine);
        if(!enable_suggestions) dialog._suggestions_combo.sensitive = false;
        grid.attach(dialog._suggestions_combo, 1, 6, 1, 1);

        // enable suggestions
        grid.attach(new Gtk.Label({label: 'Enable suggestions:' }), 0, 5, 1, 1);
        dialog._enable_suggestions = new Gtk.Switch({
            active: enable_suggestions
        });
        dialog._enable_suggestions.connect('notify::active',
            Lang.bind(this, function(s) {
                let active = s.get_active();
                if(active) dialog._suggestions_combo.sensitive = true;
                else dialog._suggestions_combo.sensitive = false;
            })
        );
        grid.attach(dialog._enable_suggestions, 1, 5, 1, 1);

        dialog.get_content_area().add(grid);
        dialog.connect('response', Lang.bind(this, function(dialog, id) {
            if(id != Gtk.ResponseType.OK) {
                dialog.destroy();
                return;
            }

            let allowed_helpers = [];

            for(let i = 0; i < this._helpers_list.length; i++) {
                if(this._helpers_list[i].check.get_active() === true) {
                    allowed_helpers.push(this._helpers_list[i].file_name);
                }
            }

            let name = dialog._engine_name.get_text();
            let keyword = dialog._engine_keyword.get_text();
            let url = dialog._engine_url.get_text();
            let enable_helpers = dialog._enable_helpers.get_active();
            let enable_suggestions = dialog._enable_suggestions.get_active();
            let suggestions_engine = dialog._suggestions_combo.get_active_id();
            let new_item = {
                name: name,
                keyword: keyword,
                url: url,
                enable_helpers: enable_helpers,
                allowed_helpers: allowed_helpers,
                enable_suggestions: enable_suggestions,
                suggestions_engine: suggestions_engine
            };

            if(!this._append_item(new_item, exists_id)) {
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
            let id = this._store.get_value(iter, this.columns.ID);
            this._remove_item(id);
            this._store.remove(iter);
        }
    },

    _refresh: function() {
        this._store.clear();

        let engines_list = search_engines.get_engines();

        for(let i = 0; i < engines_list.length; i++) {
            let engine = engines_list[i];

            if(!engine.is_open_url()) {
                let iter = this._store.append();
                this._store.set(iter,
                    [
                        this.columns.ID,
                        this.columns.DISPLAY_NAME,
                        this.columns.KEYWORD,
                        this.columns.URL,
                        this.columns.ENABLE_SUGGESTIONS,
                        this.columns.ENABLE_HELPERS,
                        this.columns.SUGGESTIONS_ENGINE
                    ],
                    [
                        engine.id,
                        engine.name,
                        engine.keyword,
                        engine.url,
                        engine.enable_suggestions,
                        engine.enable_helpers,
                        engine.suggestions_engine
                    ]
                );
            }
        }
    },

    _append_item: function(new_item, id) {
        id = parseInt(id);

        if(id > 0) {
            return search_engines.edit_engine(id, new_item);
        }
        else {
            return search_engines.add_engine(new_item);
        }
    },

    _remove_item: function(id) {
        return search_engines.remove_engine(id);
    }
});

const WebSearchDialogPrefsWidget = new GObject.Class({
    Name: 'WebSearchDialog.Prefs.Widget',
    GTypeName: 'WebSearchDialogPrefsWidget',
    Extends: Gtk.Box,

    _init: function(params) {
        this.parent(params);
        this._settings = Utils.getSettings();

        let main_page = this._get_main_page();
        let suggestions_page = this._get_suggestions_page();
        let helpers_page = this._get_helpers_page();
        let history_page = this._get_history_page();
        let open_url_page = this._get_open_url_page();

        let shortcuts = new WebSearchDialogPrefsGrid(this._settings);
        shortcuts.add_shortcut(
            'Open search dialog:',
            PrefsKeys.OPEN_SEARCH_DIALOG_KEY
        );
        let shortcuts_label = new Gtk.Label({
            label: "Keyboard shortcuts"
        });

        let notebook = new Gtk.Notebook({
            margin_left: 5,
            margin_top: 5,
            margin_bottom: 5,
            margin_right: 5
        });

        notebook.append_page(main_page.page, main_page.label);
        notebook.append_page(suggestions_page.page, suggestions_page.label);
        notebook.append_page(helpers_page.page, helpers_page.label);
        notebook.append_page(open_url_page.page, open_url_page.label);
        notebook.append_page(history_page.page, history_page.label);
        notebook.append_page(shortcuts, shortcuts_label);

        this.add(notebook);
    },

    _get_main_page: function() {
        let page_label = new Gtk.Label({
            label: 'Search engines'
        });
        let page = new WebSearchDialogPrefsGrid(this._settings);

        // default engine
        let engines_list = search_engines.get_engines();
        let result_list = [];

        for(let i = 0; i < engines_list.length; i++) {
            let engine = engines_list[i];
            let result = {
                title: engine.name,
                value: engine.id
            };
            result_list.push(result);
        }

        let combo = page.add_combo(
            'Default search engine:',
            PrefsKeys.DEFAULT_ENGINE_KEY,
            result_list
        );

        let engines = new WebSearchDialogPrefsEnginesList(this._settings);
        page.add_item(engines, 0, this._rownum, 1, 1);

        let result = {
            label: page_label,
            page: page
        };
        return result;
    },

    _get_suggestions_page: function() {
        let page_label = new Gtk.Label({
            label: 'Suggestions'
        });
        let page = new WebSearchDialogPrefsGrid(this._settings);

        // suggestions
        let enable = page.add_boolean(
            'Enable:',
            PrefsKeys.SUGGESTIONS_KEY
        );
        enable.connect('notify::active', Lang.bind(this, function(s) {
            let active = s.get_active();
            combo.sensitive = active;
            max_suggestions.sensitive = active;
            delay.sensitive = active;
        }));
        // default
        let combo = get_suggestions_combo();
        combo.sensitive = enable.get_active();
        combo.connect('changed', Lang.bind(this, function(c) {
            let value = combo.get_active_id();
            let key = PrefsKeys.DEFAULT_SUGGESTIONS_KEY

            if(this._settings.get_string(key) !== value) {
                this._settings.set_string(key, value);
            }
        }));
        combo.set_active_id(
            this._settings.get_string(PrefsKeys.DEFAULT_SUGGESTIONS_KEY)
        );
        page.add_row(
            'Default suggestions:',
            combo
        );

        // max suggestions
        let max_suggestions_adjustment = {
            lower: 1,
            upper: 9,
            step_increment: 1
        };
        let max_suggestions = page.add_spin(
            'Max:',
            PrefsKeys.MAX_SUGGESTIONS,
            max_suggestions_adjustment
        );
        max_suggestions.sensitive = enable.get_active();
        // suggestions delay
        let suggestions_delay_adjustment = {
            lower: 100,
            upper: 1000,
            step_increment: 10
        };
        let delay = page.add_spin(
            'Delay(ms):',
            PrefsKeys.SUGGESTIONS_DELAY_KEY,
            suggestions_delay_adjustment
        );
        delay.sensitive = enable.get_active();

        let result = {
            label: page_label,
            page: page
        };
        return result;
    },

    _get_history_page: function() {
        let page_label = new Gtk.Label({
            label: 'History'
        });
        let page = new WebSearchDialogPrefsGrid(this._settings);

        // history limit
        let history_limit_adjustment = {
            lower: 10,
            upper: 1000,
            step_increment: 5
        }
        let hisotry_limit = page.add_spin(
            'History limit:',
            PrefsKeys.HISTORY_LIMIT_KEY,
            history_limit_adjustment
        );

        // history suggestions
        let enable = page.add_boolean(
            'History suggestions:',
            PrefsKeys.HISTORY_SUGGESTIONS_KEY
        );
        enable.connect('notify::active', Lang.bind(this, function(s) {
            let active = s.get_active();
            max_history_suggestions.sensitive = active;
        }));

        // max history suggestions
        let max_suggestions_adjustment = {
            lower: 1,
            upper: 9,
            step_increment: 1
        };
        let max_history_suggestions = page.add_spin(
            'Max history suggestions:',
            PrefsKeys.MAX_HISTORY_SUGGESTIONS,
            max_suggestions_adjustment
        );
        max_history_suggestions.sensitive = enable.get_active();

        let result = {
            label: page_label,
            page: page
        };
        return result;
    },

    _get_helpers_page: function() {
        let page_label = new Gtk.Label({
            label: 'Helpers'
        });
        let page = new WebSearchDialogPrefsGrid(this._settings);

        // enable
        let enable = page.add_boolean(
            'Enable:',
            PrefsKeys.HELPER_KEY
        );
        enable.connect('notify::active', Lang.bind(this, function(s) {
            let active = s.get_active();
            delay.sensitive = active;
            position.sensitive = active;
        }));

        // delay
        let helper_delay_adjustment = {
            lower: 250,
            upper: 2000,
            step_increment: 10
        };
        let delay = page.add_spin(
            'Delay(ms):',
            PrefsKeys.HELPER_DELAY_KEY,
            helper_delay_adjustment
        );
        delay.sensitive = enable.get_active();

        // position
        let helpers_positions = [
            {title: 'Top', value: 0},
            {title: 'Bottom', value: 1}
        ];
        let position = page.add_combo(
            'Helpers position:',
            PrefsKeys.HELPER_POSITION_KEY,
            helpers_positions
        );
        position.sensitive = enable.get_active();

        let result = {
            label: page_label,
            page: page
        };
        return result;
    },

    _get_open_url_page: function() {
        let page_label = new Gtk.Label({
            label: 'Open URL'
        });
        let page = new WebSearchDialogPrefsGrid(this._settings);

        // enable
        let enable = page.add_boolean(
            'Enable:',
            PrefsKeys.ENABLE_OPEN_URL_KEY
        );
        enable.connect('notify::active', Lang.bind(this, function(s) {
            let active = s.get_active();
            keyword.sensitive = active;
            label.sensitive = active;
        }));

        // open url keyword
        let keyword = page.add_entry(
            'Open url keyword:',
            PrefsKeys.OPEN_URL_KEY
        );
        keyword.sensitive = enable.get_active();

        // open url label
        let label = page.add_entry(
            'Open url label:',
            PrefsKeys.OPEN_URL_LABEL
        );
        label.sensitive = enable.get_active();

        let result = {
            label: page_label,
            page: page
        };
        return result;
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
