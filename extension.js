const St = imports.gi.St;
const Lang = imports.lang;
const Meta = imports.gi.Meta;
const Main = imports.ui.main;
const Clutter = imports.gi.Clutter;
const Gio = imports.gi.Gio;
const Params = imports.misc.params;
const ModalDialog = imports.ui.modalDialog;
const Tweener = imports.ui.tweener;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const SearchEngines = Me.imports.search_engines;
const Infobox = Me.imports.infobox;
const Utils = Me.imports.utils;
const HistoryManager = Me.imports.history_manager;
const Prefs = Me.imports.prefs_keys;

const ICONS = Utils.ICONS;
const INFOBOX_TYPES = Infobox.INFOBOX_TYPES;

ExtensionUtils.get_web_search_dialog_extension = function() {
    return Me;
}

const WebSearchDialogModal = new Lang.Class({
    Name: 'WebSearchDialogModal',
    Extends: ModalDialog.ModalDialog,

    _init: function() {
        this.parent();
        this._dialogLayout =
            typeof this.dialogLayout === "undefined"
            ? this._dialogLayout
            : this.dialogLayout;

        this._dialogLayout.set_style_class_name('');
        this._dialogLayout.set_margin_bottom(300);
        this.contentLayout.set_style_class_name('search-dialog');

        this.hint = new St.Label({
            style_class: 'search-hint'
        });
        this._hint_box = new St.BoxLayout({
            visible: false
        });
        this._hint_box.add(this.hint);

        this.engine_label = new St.Label({
            style_class: 'search-engine-label',
            text: 'Web Search:'
        });

        this.entry = new St.Entry({
            style_class: 'search-entry'
        });

        this._search_table = new St.Table({
            name: 'web_search_table'
        });
        this._search_table.add(this.engine_label, {
            row: 0,
            col: 0
        });
        this._search_table.add(this.entry, {
            row: 0,
            col: 1
        });
        this._search_table.show();

        this.contentLayout.add(this._search_table);
        this.contentLayout.add(this._hint_box);
    },

    show_hint: function(params) {
        params = Params.parse(params, {
            text: null,
            icon_name: ICONS.information
        })

        if(Utils.is_blank(params.text)) {
            return false;
        }

        let icon = new St.Icon({
            icon_name: params.icon_name,
            style_class: 'hint-icon'
        });

        if(this._hint_box.get_children().length > 1) {
            this._hint_box.replace_child(
                this._hint_box.get_children()[0],
                icon
            )
        }
        else {
            this._hint_box.insert_child_at_index(icon, 0);
        }

        this._hint_box.opacity = 30;
        this._hint_box.show();

        if(params.text != this.hint.get_text()) {
            this.hint.set_text(params.text);
        }

        Tweener.addTween(this._hint_box, {
            time: 0.1,
            opacity: 255,
            transition: 'easeOutQuad',
            onComplete: Lang.bind(this, function() {
                Tweener.addTween(this._hint_box, {
                    opacity: 120,
                    time: 0.1,
                    transition: 'easeOutQuad'
                });
            })
        });

        return true;
    },

    hide_hint: function() {
        if(this._hint_box.visible) {
            Tweener.addTween(this._hint_box, {
                opacity: 0,
                height: 0,
                time: 0.1,
                transition: 'easeOutQuad',
                onComplete: Lang.bind(this, function() {
                    this._hint_box.hide();
                    this._hint_box.set_height(-1);
                })
            })

            return true;
        }

        return false;
    },

    show_engine_label: function(text) {
        if(Utils.is_blank(text)) {
            return false;
        }

        let opacity = this.engine_label.opacity == 255;
        let visible = this.engine_label.visible;

        if(opacity && visible) {
            this.hide_engine_label();
        }

        this.engine_label.opacity = 0;
        this.engine_label.set_text(text);
        this.engine_label.show()

        let natural_width = this.contentLayout.get_preferred_width(-1)[1];

        Tweener.addTween(this.contentLayout, {
            width: natural_width+5,
            time: 0.2,
            transition: 'easeOutQuad',
            onStart: Lang.bind(this, function() {
                Tweener.addTween(this.engine_label, {
                    opacity: 255,
                    time: 0.1,
                    transition: 'easeOutQuad'
                })
            }),
            onComplete: Lang.bind(this, function() {
                this.contentLayout.set_width(-1);
            })
        });

        return true;
    },

    hide_engine_label: function() {
        if(!this.engine_label.visible) {
            return false;
        }

        Tweener.addTween(this.engine_label, {
            opacity: 0,
            time: 0.2,
            transition: 'easeOutQuad',
            onComplete: Lang.bind(this, function() {
                this.contentLayout.set_width(-1);
                this.engine_label.hide();
                this.engine_label.set_text('');
            })
        })

        return true;
    }
});

const WebSearchDialog = new Lang.Class({
    Name: 'WebSearchDialog',

    _init: function() {
        this._settings = Utils.getSettings();
        this._clipboard = St.Clipboard.get_default();

        this._modal = new WebSearchDialogModal();
        this._modal.entry.connect(
            'key-press-event',
            Lang.bind(this, this._on_key_press)
        );
        this._modal.entry.get_clutter_text().connect(
            'activate',
            Lang.bind(this, this._on_activate)
        );
        this._modal.entry.get_clutter_text().connect(
            'text-changed',
            Lang.bind(this, this._on_search_text_changed)
        );

        this.search_engines = new SearchEngines.SearchEngines();

        this.infobox = new Infobox.InfoboxManager(this._modal);
        this.infobox.connect(
            'suggestion-activated',
            Lang.bind(this, this._on_suggestion_activated)
        );

        this.search_history = new HistoryManager.SearchHistoryManager();

        this.activate_window = false;
        this._window_handler_id = global.display.connect(
            'window-demands-attention',
            Lang.bind(this, this._on_window_demands_attention)
        );
    },

    _get_main_hint: function() {
        let default_engine = this.search_engines.get_default_engine();
        let hint = 
            'Type to search in '+default_engine.name+' or enter '+
            'a keyword and press "space".';

        if(this.search_engines.get_open_url_keyword()) {
            hint +=
                '\nKeyword "'+this.search_engines.get_open_url_keyword()+
                '" for open URL.';
        }

        hint += '\nPress "Tab" for available search engines.';

        return hint;
    },

    _on_window_demands_attention: function(display, window) {
        if(this.activate_window) {
            this.activate_window = false;
            Main.activateWindow(window);
        }
    },

    _on_suggestion_activated: function(object, menu_item) {
        if(menu_item.type === INFOBOX_TYPES.SEARCH_ENGINE) {
            this._set_engine(menu_item.keyword);
        }
        else {
            if(
                menu_item.type === INFOBOX_TYPES.SUGGESTIONS_NAVIGATION ||
                menu_item.type === INFOBOX_TYPES.HISTORY_NAVIGATION
            ) {
                this._open_url(menu_item.url, true);
            }
            else {
                this._activate_search(menu_item.text);
            }
        }
    },

    _on_activate: function(text) {
        text = text.get_text();

        if(!Utils.is_blank(text)) {
            if(this.search_engines.current.is_open_url()) {
                this._open_url(text, true);
            }
            else {
                this._activate_search(text);
            }
        }
    },

    _on_key_press: function(o, e) {
        let symbol = e.get_key_symbol();

        if(symbol == Clutter.Escape) {
            this.close();
        }
        else if(symbol == Clutter.Tab) {
            if(this.infobox._box.is_open()) {
                this.infobox.set_active_menu_item(0);
            }
            else {
                let text = this._modal.entry.get_text();

                if(Utils.is_blank(text)) {
                    this.infobox.display(null, this.search_engines.current, {
                        engines: true
                    });
                }
            }
        }
        else if(symbol == Clutter.Down) {
            if(this.infobox._box.is_open()) {
                this.infobox.grab_focus();
            }
            else {
                this.infobox.show_suggestions_trigger = false;
                let text = this._modal.entry.get_text();
                let item = this.search_history.next_item(text);
                this._modal.entry.set_text(item.query);

                // let hint_text = 'History.\nCurrent item '+
                //     this.search_history.current_index()+' of '+
                //     this.search_history.total_items();
                // this._show_hint({
                //     text: hint_text,
                //     icon_name: ICONS.information
                // });
            }
        }
        else if(symbol == Clutter.Up) {
            if(!this.infobox.is_open()) {
                this.infobox.show_suggestions_trigger = false;
                let text = this._modal.entry.get_text();
                let item = this.search_history.prev_item(text);
                this._modal.entry.set_text(item.query);

                // let hint_text = 'History.\nCurrent item '+
                //     this.search_history.current_index()+' of '+
                //     this.search_history.total_items();
                // this._show_hint({
                //     text: hint_text,
                //     icon_name: ICONS.information
                // });
            }
        }
        // Ctrl+V
        else if(symbol == 118) {
            this._clipboard.get_text(Lang.bind(this, function(clipboard, text) {
                if(!Utils.is_blank(text)) {
                    let clutter_text = this._modal.entry.get_clutter_text();
                    clutter_text.delete_selection();
                    let pos = clutter_text.get_cursor_position();
                    clutter_text.insert_text(text, pos);
                }
            }));
        }
        // Ctrl+C
        else if(symbol == 99) {
            let clutter_text = this._modal.entry.get_clutter_text();
            let selection = clutter_text.get_selection();
            this._clipboard.set_text(selection);
        }
        // Ctrl+Shift+V - paste and search
        else if(symbol == 86) {
            // if(!this.search_engine) {
            //     this._set_engine();
            // }

            this._clipboard.get_text(Lang.bind(this, function(clipboard, text) {
                if(Utils.is_blank(text)) {
                    this._modal.show_hint({
                        text: 'Clipboard is empty.',
                        icon_name: ICONS.error
                    });
                }
                else {
                    this._activate_search(text);
                }
            }));
        }
        // Ctrl+Shift+G - paste and go
        else if(symbol == 71) {
            // if(!this.search_engine) {
            //     this._set_engine();
            // }

            this._clipboard.get_text(Lang.bind(this, function(clipboard, url) {
                if(Utils.is_blank(url)) {
                    this._modal.show_hint({
                        text: 'Clipboard is empty.',
                        icon_name: ICONS.error
                    });
                }
                else {
                    this._open_url(url, true);
                }
            }));
        }
        else {
            // nothing
        }

        return true;
    },

    _on_search_text_changed: function() {
        let text = this._modal.entry.get_text();

        if(Utils.is_blank(text)) {
            if(this.search_engines.current.is_default()) {
                let hint_text = this._get_main_hint();
                this._modal.show_hint({
                    text: hint_text,
                    icon_name: ICONS.information
                });
            }
        }
        else {
            this._modal.hide_hint();
        }

        if(this.search_engines.current.is_default()) {
            let keyword = this._get_keyword(text);
            this._set_engine(keyword);
        }

        if(this.search_engines.current.is_open_url()) {
            if(!Utils.is_matches_protocol(text)) {
                text = 'http://'+text;
                this._modal.entry.set_text(text);
            }
        }

        let params = {};

        if(this._settings.get_boolean(Prefs.SUGGESTIONS_KEY)) {
            params.suggestions = true;
        }

        params.helpers = true;

        this.infobox.display(text, this.search_engines.current, params);
    },

    _get_keyword: function(text) {
        let result = false;
        let web_search_query_regexp = /^(.+?)\s$/;

        if(web_search_query_regexp.test(text)) {
            let matches = web_search_query_regexp.exec(text);
            let keyword = matches[0].trim();

            if(!Utils.is_blank(keyword)) {
                result = keyword;
            }
        }

        return result;
    },

    _set_engine: function(keyword) {
        // log(this.search_engines.current);

        if(this.search_engines.is_keyword_exist(keyword)) {
            let engine =
                this.search_engines.get_engine_by_property(keyword, 'keyword');
            this.search_engines.set_current(engine.id);
        }
        else {
            if(!this.search_engines.current.is_default()) {
                let engine = this.search_engines.get_default_engine();
                this.search_engines.set_current(engine.id);
            }
        }
        // log('SETTED: '+this.search_engines.current);
        // let hint_text;

        if(!this.search_engines.current.is_default()) {
        //     if(!engine.is_open_url()) {
        //         hint_text =
        //             'Type to search in '+this.search_engines.current.name+'.';
        //     }
        //     else {
        //         hint_text = 'Please, enter a URL.';
        //     }

        //     hint_text += '\nPress "Tab" to switch search engine.';
            this.infobox.show_suggestions_trigger = false;
            this.infobox.show_helpers_trigger = false;
            this._modal.entry.set_text('');
            this._modal.show_engine_label(this.search_engines.current.name+':');

            // this._modal.show_hint({
            //     text: hint_text,
            //     icon_name: ICONS.information
            // });
        }
        // else {
            // hint_text = this._get_main_hint();
            // this._modal.show_hint({
            //     text: hint_text,
            //     icon_name: ICONS.information
            // });
        // }

        return true;
    },

    _activate_search: function(text) {
        if(Utils.is_blank(text)) {
            this._modal.show_hint({
                text: 'Error.\nPlease, enter a query.',
                icon_name: ICONS.error
            });

            return;
        }

        this.search_history.add_item({
            query: text,
            type: INFOBOX_TYPES.HISTORY_QUERY
        });

        text = encodeURIComponent(text);
        let url = this.search_engines.current.make_query_url(text);
        this._open_url(url);
    },

    _open_url: function(url, to_history) {
        url = Utils.get_url(url);

        if(!url) {
            this._modal.show_hint({
                text: 'Please, enter a valid url.',
                icon_name: ICONS.error
            });

            return;
        }
        else {
            this.close();
        }

        if(to_history === true) {
            this.search_history.add_item({
                query: url,
                type: INFOBOX_TYPES.HISTORY_NAVIGATION
            });
        } 

        this.activate_window = true;

        Gio.app_info_launch_default_for_uri(
            url,
            Utils._makeLaunchContext({})
        );
    },

    open: function() {
        this._modal.open();
        this._modal.entry.grab_key_focus();
        this._modal.show_hint({
            text: this._get_main_hint(),
            icon_name: ICONS.information
        });
    },

    close: function() {
        this.search_history.reset_index();
        this._modal.hide_engine_label();
        this._modal.entry.set_text('');
        // this.search_engine = false;
        this.infobox.close()
        this._modal.close();
    },

    enable: function() {
        global.display.add_keybinding(
            Prefs.OPEN_SEARCH_DIALOG_KEY,
            this._settings,
            Meta.KeyBindingFlags.NONE,
            Lang.bind(this, function() {
                this.open();
            })
        );
    },

    disable: function() {
        global.display.remove_keybinding(Prefs.OPEN_SEARCH_DIALOG_KEY);
        global.display.disconnect(this._window_handler_id);
    }
});

let search_dialog = null;

function init() {
    // nothing
}

function enable() {
    search_dialog = new WebSearchDialog();
    search_dialog.enable();
}

function disable() {
    if(search_dialog != null) {
        search_dialog.disable();
        search_dialog = null;
    }
}
