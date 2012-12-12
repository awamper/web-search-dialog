const St = imports.gi.St;
const Lang = imports.lang;
const Meta = imports.gi.Meta;
const Main = imports.ui.main;
const Mainloop = imports.mainloop;
const Clutter = imports.gi.Clutter;
const Gio = imports.gi.Gio;
const Soup = imports.gi.Soup;
const Params = imports.misc.params;
const ModalDialog = imports.ui.modalDialog;
const Tweener = imports.ui.tweener;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Suggestions = Me.imports.suggestions_box;
const Helper = Me.imports.helper;
const Utils = Me.imports.utils;
const HistoryManager = Me.imports.history_manager;
const Prefs = Me.imports.prefs;

const _httpSession = Utils._httpSession;
const ICONS = Utils.ICONS;

const SUGGESTIONS_URL = 
    "https://suggestqueries.google.com/complete/search?client=chrome&q=";

const WebSearchDialog = new Lang.Class({
    Name: 'WebSearchDialog',
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

        this._settings = Utils.getSettings();
        this._clipboard = St.Clipboard.get_default();
        this._suggestions_delay_id = 0;
        this._helper_delay_id = 0;
        this.show_suggestions = true;
        this.activate_first_suggestion = true;
        this.search_engine = false;

        this._create_search_dialog();

        this.activate_window = false;
        this._window_handler_id = global.display.connect(
            'window-demands-attention',
            Lang.bind(this, this._on_window_demands_attention)
        );
    },

    _get_main_hint: function() {
        let default_engine = this._get_default_engine();
        let hint = 
            'Type to search in '+default_engine.name+' or enter '+
            'a keyword and press "space".';

        if(this._get_open_url_keyword()) {
            hint +=
                '\nKeyword "'+this._get_open_url_keyword()+'" for open URL.';
        }

        hint += '\nPress "Tab" for available search engines.';

        return hint;
    },

    _remove_delay_id: function() {
        if(this._suggestions_delay_id > 0) {
            Mainloop.source_remove(this._suggestions_delay_id);
            this._suggestions_delay_id = 0;
        }
        if(this._helper_delay_id > 0) {
            Mainloop.source_remove(this._helper_delay_id);
            this._helper_delay_id = 0;
        }
    },

    _on_window_demands_attention: function(display, window) {
        if(this.activate_window) {
            this.activate_window = false;
            Main.activateWindow(window);
        }
    },

    _create_search_dialog: function() {
        this.hint = new St.Label({
            style_class: 'search-hint'
        });
        this._hint_box = new St.BoxLayout({
            visible: false
        });
        this._hint_box.add(this.hint);

        this.search_engine_label = new St.Label({
            style_class: 'search-engine-label',
            text: 'Web Search:'
        });

        this.search_entry = new St.Entry({
            style_class: 'search-entry'
        });
        this.search_entry.connect(
            'key-press-event',
            Lang.bind(this, this._on_key_press)
        );
        this.search_entry.get_clutter_text().connect(
            'activate',
            Lang.bind(this, this._on_text_activate)
        );
        this.search_entry.get_clutter_text().connect(
            'text-changed', 
            Lang.bind(this, this._on_search_text_changed)
        );
        this.search_entry.get_clutter_text().connect(
            'key-press-event',
            Lang.bind(this, this._on_text_key_press)
        );

        this.duckduckgo_helper = new Helper.DuckDuckGoHelper();
        this.suggestions_box = new Suggestions.SuggestionsBox(this);
        this.suggestions_box.setSourceAlignment(0.02);

        this.search_history = new HistoryManager.SearchHistoryManager();

        this._search_table = new St.Table({
            name: 'web_search_table'
        });
        this._search_table.add(this.search_engine_label, {
            row: 0,
            col: 0
        });
        this._search_table.add(this.search_entry, {
            row: 0,
            col: 1
        });
        this._search_table.show();

        this.contentLayout.add(this._search_table);
        this.contentLayout.add(this._hint_box);
    },

    _on_key_press: function(o, e) {
        let symbol = e.get_key_symbol();
        let control_mask = (e.get_state() & Clutter.ModifierType.CONTROL_MASK);
        let shift_mask = (e.get_state() & Clutter.ModifierType.SHIFT_MASK);

        if(symbol == Clutter.Escape) {
            this.close();
        }
        else if(symbol == Clutter.Tab) {
            if(this.suggestions_box.isOpen) {
                this.suggestions_box.firstMenuItem.setActive(true);
            }
            else {
                let text = this.search_entry.get_text();

                if(Utils.is_blank(text)) {
                    this._display_engines();
                }
            }
        }
        else if(symbol == Clutter.Down) {
            if(this.suggestions_box.isOpen) {
                this.suggestions_box.firstMenuItem.setActive(true);
            }
            else {
                this.show_suggestions = false;
                let text = this.search_entry.get_text();
                let item = this.search_history.next_item(text);
                this.search_entry.set_text(item.query);

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
            if(!this.suggestions_box.isOpen) {
                this.show_suggestions = false;
                let text = this.search_entry.get_text();
                let item = this.search_history.prev_item(text);
                this.search_entry.set_text(item.query);

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
        else if(control_mask && symbol == 118) {
            this._clipboard.get_text(Lang.bind(this, function(clipboard, text) {
                if (Utils.is_blank(text)) {
                    return false;
                }

                let clutter_text = this.search_entry.get_clutter_text();
                clutter_text.delete_selection();
                let pos = clutter_text.get_cursor_position();
                clutter_text.insert_text(text, pos);

                return true;
            }));
        }
        // Ctrl+C
        else if(control_mask && symbol == 99) {
            let clutter_text = this.search_entry.get_clutter_text();
            let selection = clutter_text.get_selection();
            this._clipboard.set_text(selection);
        }
        // Ctrl+Shift+V - paste and search
        else if(control_mask && shift_mask && symbol == 86) {
            if(!this.search_engine) {
                this._set_engine();
            }

            this._clipboard.get_text(Lang.bind(this, function(clipboard, text) {
                if(Utils.is_blank(text)) {
                    this._show_hint({
                        text: 'Clipboard is empty.',
                        icon_name: ICONS.error
                    });

                    return false;
                }
                else {
                    this._activate_search(text);

                    return true;
                }
            }));
        }
        // Ctrl+Shift+G - paste and go
        else if(control_mask && shift_mask && symbol == 71) {
            if(!this.search_engine) {
                this._set_engine();
            }

            this._clipboard.get_text(Lang.bind(this, function(clipboard, url) {
                if(Utils.is_blank(url)) {
                    this._show_hint({
                        text: 'Clipboard is empty.',
                        icon_name: ICONS.error
                    });

                    return false;
                }
                else {
                    this._open_url(url, true);

                    return true;
                }
            }));
        }
        else if(control_mask && Utils.KEYBOARD_NUMBERS.indexOf(symbol) != -1) {
            let item_id = Utils.KEYBOARD_NUMBERS.indexOf(symbol);
            this.suggestions_box.activate_by_id(item_id);
        }
        else {
            // nothing
        }

        return true;
    },

    _on_text_activate: function(text) {
        text = text.get_text();

        if(!Utils.is_blank(text)) {
            if(this.search_engine.open_url) {
                this._open_url(text, true);
            }
            else {
                this._activate_search(text);
            }
        }
    },

    _on_text_key_press: function(o, e) {
        let symbol = e.get_key_symbol();

        if(symbol == Clutter.BackSpace) {
            this.activate_first_suggestion = false;
        }
        else if(symbol == Clutter.Right) {
            let sel = this.search_entry.clutter_text.get_selection_bound();

            if(sel === -1) {
                this.search_entry.clutter_text.set_cursor_position(
                    this.search_entry.text.length
                );
            }
        }
    },

    _on_search_text_changed: function() {
        this._remove_delay_id();
        let text = this.search_entry.get_text();

        if(Utils.is_blank(text)) {
            this.suggestions_box.close();

            if(this.search_engine._default === true) {
                let hint_text = this._get_main_hint();
                this._show_hint({
                    text: hint_text,
                    icon_name: ICONS.information
                });
            }
        }
        else {
            this._hide_hint();
        }

        if(this.search_engine == false || this.search_engine._default) {
            let keyword = this._get_keyword(text);
            this._set_engine(keyword);
        }

        if(this.show_suggestions) {
            if(this.search_engine.open_url) {
                if(!Utils.is_matches_protocol(text)) {
                    text = 'http://'+text;
                    this.search_entry.set_text(text);
                }

                if(/^https?:\/\/.+?/.test(text)) {
                    this._display_suggestions(text);
                }
                else {
                    this.suggestions_box.close();
                }
            }
            else {
                this._display_helper(text);
                this._display_suggestions(text);
            }
        }
        else {
            this.show_suggestions = true;
        }

        return true;
    },

    _get_open_url_keyword: function() {
        let key = this._settings.get_string(Prefs.OPEN_URL_KEY);

        if(Utils.is_blank(key)) {
            return false;
        }
        else {
            return key.trim();
        }
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

    _get_default_engine: function() {
        let engines = this._settings.get_strv(Prefs.ENGINES_KEY);
        let index = this._settings.get_int(Prefs.DEFAULT_ENGINE_KEY);
        let engine = JSON.parse(engines[index]);
        
        if(!Utils.is_blank(engine.url)) {
            return engine;
        }
        else {
            return false;
        }
    },

    _get_engine: function(key) {
        if(Utils.is_blank(key)) {
            return false;
        }

        let info;
        key = key.trim();

        if(key == this._get_open_url_keyword()) {
            info = {
                name: this._settings.get_string(Prefs.OPEN_URL_LABEL),
                keyword: this._settings.get_string(Prefs.OPEN_URL_KEY),
                open_url: true
            };

            return info;
        }
        else {
            let engines_list = this._settings.get_strv(Prefs.ENGINES_KEY);

            for(let i = 0; i < engines_list.length; i++) {
                info = JSON.parse(engines_list[i]);

                if(info.keyword == key && info.url.length > 0) {
                    info.open_url = false;
                    return info;
                }
            }
        }

        return false;
    },

    _set_engine: function(keyword) {
        this._remove_delay_id();

        let engine_info = this._get_engine(keyword);
        let engine = '';
        this.search_engine = {};

        if(engine_info) {
            engine = engine_info;
            this.search_engine._default = false;
        }
        else {
            engine = this._get_default_engine();
            this.search_engine._default = true;
        }

        if(engine.keyword == this.search_engine.keyword) {
            return false;
        }

        this.search_engine.keyword = engine.keyword.trim();
        this.search_engine.open_url = engine.open_url;
        this.search_engine.name = engine.name.trim();
        this.search_engine.url = !engine.open_url
            ? engine.url.trim()
            : null

        if(!this.search_engine._default) {
            let hint_text;

            if(!engine.open_url) {
                hint_text = 'Type to search in '+this.search_engine.name+'.';
            }
            else {
                hint_text = 'Please, enter a URL.';
            }

            hint_text += '\nPress "Tab" to switch search engine.';
            this.show_suggestions = false;
            this.search_entry.set_text('');
            this._show_engine_label(this.search_engine.name+':');

            this._show_hint({
                text: hint_text,
                icon_name: ICONS.information
            });
        }

        return true;
    },

    _show_hint: function(params) {
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

    _hide_hint: function() {
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

    _show_engine_label: function(text) {
        if(Utils.is_blank(text)) {
            return false;
        }

        let opacity = this.search_engine_label.opacity == 255;
        let visible = this.search_engine_label.visible;

        if(opacity && visible) {
            this._hide_engine_label();
        }

        this.search_engine_label.opacity = 0;
        this.search_engine_label.set_text(text);
        this.search_engine_label.show()

        let natural_width = this.contentLayout.get_preferred_width(-1)[1];

        Tweener.addTween(this.contentLayout, {
            width: natural_width+5,
            time: 0.2,
            transition: 'easeOutQuad',
            onStart: Lang.bind(this, function() {
                Tweener.addTween(this.search_engine_label, {
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

    _hide_engine_label: function() {
        if(!this.search_engine_label.visible) {
            return false;
        }

        Tweener.addTween(this.search_engine_label, {
            opacity: 0,
            time: 0.2,
            transition: 'easeOutQuad',
            onComplete: Lang.bind(this, function() {
                this.contentLayout.set_width(-1);
                this.search_engine_label.hide();
                this.search_engine_label.set_text('');
            })
        })

        return true;
    },

    _parse_suggestions: function(suggestions_source) {
        if(suggestions_source[1].length < 1) {
            return false;
        }

        let result = new Array();

        for(let i = 0; i < suggestions_source[1].length; i++) {
            let text = suggestions_source[1][i].trim();
            let type = suggestions_source[4]['google:suggesttype'][i].trim();
            let relevance = parseInt(
                suggestions_source[4]['google:suggestrelevance'][i]
            );

            if(Utils.is_blank(text)) {continue;}
            if(Utils.is_blank(type)) {continue;}
            if(relevance < 1) {continue;}

            let suggestion = {
                text: text,
                type: type,
                relevance: relevance
            }
            result.push(suggestion);
        }

        return result.length > 0 ? result : false;
    },

    _get_suggestions: function(text, callback) {
        text = encodeURIComponent(text);
        let url = SUGGESTIONS_URL+text;
        let here = this;

        let request = Soup.Message.new('GET', url);

        _httpSession.queue_message(request, function(_httpSession, message) {
            if(message.status_code === 200) {
                let result = JSON.parse(request.response_body.data);

                if(result[1].length < 1) {
                    callback.call(here, false);
                }
                else {
                    callback.call(here, result);
                }
            }
            else {
                callback.call(here, false);
            }
        });
    },

    _display_helper: function(text) {
        if(!this._settings.get_boolean(Prefs.HELPER_KEY)) {
            return false;
        }

        this.suggestions_box.remove_all_by_types(['HELPER']);
        this._helper_delay_id = Mainloop.timeout_add(
            this._settings.get_int(Prefs.HELPER_DELAY_KEY),
            Lang.bind(this, function() {
                this.suggestions_box.addMenuItem(
                    new Helper.HelperSpinnerMenuItem()
                );
                this.duckduckgo_helper.get_info(text,
                    Lang.bind(this, function(result) {
                        this.suggestions_box.remove_all_by_types(['HELPER']);
                        let image = {
                            url: result.image
                        };
                        let menu_item = 
                            this.duckduckgo_helper.get_menu_item({
                                heading: result.heading,
                                definition: result.definition,
                                abstract: result.abstract,
                                icon: image
                            });

                        if(menu_item) {
                            let position = 0;
                            let set_position = this._settings.get_string(
                                Prefs.HELPER_POSITION_KEY
                            );

                            if(set_position === 'bottom') {
                                position = this.suggestions_box.numMenuItems;

                                if(position > 0) {
                                    position += 1;
                                }
                            }
                            this.suggestions_box.addMenuItem(menu_item, position);
                            this.suggestions_box.open();
                        }
                    })
                );
            })
        );

        return true;
    },

    _display_suggestions: function(text) {
        if(!this._settings.get_boolean(Prefs.SUGGESTIONS_KEY)) {
            return false;
        }
        if(!this.show_suggestions) {
            return false;
        }

        if(Utils.is_blank(text)) {
            this.suggestions_box.close();

            return false;
        }

        this.suggestions_box.open();
        // text = text.trim();

        this._suggestions_delay_id = Mainloop.timeout_add(
            this._settings.get_int(Prefs.SUGGESTIONS_DELAY_KEY),
            Lang.bind(this, function() {
                this._get_suggestions(text, function(suggestions) {
                    this.suggestions_box.remove_all_by_types('ALL');

                    if(!suggestions) {
                        this.suggestions_box.close();
                        return false;
                    }

                    suggestions = this._parse_suggestions(suggestions);

                    if(!suggestions){return false;}

                    for(let i = 0; i < suggestions.length; i++) {
                        let suggestion = suggestions[i];

                        if(this.search_engine.open_url && 
                            suggestion.type != 'NAVIGATION') {
                            
                            continue;
                        }
                        if(suggestion.text == text) {
                            continue;
                        }

                        this.suggestions_box.add_suggestion({
                            text: suggestion.text,
                            type: suggestion.type,
                            relevance: suggestion.relevance,
                            term: text
                        });
                    }

                    this._display_history_suggestions(text);

                    if(this.suggestions_box.isEmpty()) {
                        this.suggestions_box.close();
                    }
                    else {
                        if(this.activate_first_suggestion) {
                            this._activate_first_suggestion(text);
                        }
                        else {
                            this.activate_first_suggestion = true;
                        }
                    }

                    return true;
                });
            })
        );

        return true;
    },

    _activate_first_suggestion: function(text) {
        if(!this._settings.get_boolean(Prefs.ACTIVATE_FIRST_SUGGESTION)) {
            return false;
        }

        let item = this.suggestions_box.firstMenuItem;

        if(text.slice(-1) != ' ') {
            if(item._text.slice(0, text.length) != text) {
                return false;
            }

            this.show_suggestions = false;
            this.search_entry.set_text(item._text);
            this.search_entry.clutter_text.set_selection(
                text.length,
                item._text.length
            );
            item.actor.add_style_pseudo_class('active');

            this._display_helper(text);
        }

        return true;
    },

    _display_history_suggestions: function(text) {
        if(!this._settings.get_boolean(Prefs.HISTORY_SUGGESTIONS_KEY)) {
            return false;
        }

        let types = ['QUERY', 'NAVIGATION'];

        if(this.search_engine.open_url) {
            types = ['NAVIGATION'];
        }

        let history_suggestions = this.search_history.get_best_matches({
            text: text,
            types: types,
            min_score: 0.35,
            limit: 3,
            fuzziness: 0.5
        });

        if(history_suggestions.length > 0) {
            this.suggestions_box.add_label('History:');

            for(let i = 0; i < history_suggestions.length; i++) {
                this.suggestions_box.add_suggestion({
                    text: history_suggestions[i][1].query,
                    type: history_suggestions[i][1].type,
                    relevance: history_suggestions[i][0],
                    term: text
                });
            }
        }

        return true;
    },

    _display_engines: function() {
        this._remove_delay_id();

        this.suggestions_box.removeAll();
        let engines = this._settings.get_strv(Prefs.ENGINES_KEY);

        for(let i = 0; i < engines.length; i++) {
            let engine = JSON.parse(engines[i]);
            let default_engine = this._get_default_engine();

            if(this.search_engine.keyword == engine.keyword) {
                continue;
            }
            else if(default_engine.name == engine.name) {
                continue;
            }
            else {
                this.suggestions_box.add_suggestion({
                    text: engine.name,
                    type: 'ENGINE',
                    term: engine.keyword
                });
            }
        }

        if(this._get_open_url_keyword()) {
            this.suggestions_box.add_suggestion({
                text: this._settings.get_string(Prefs.OPEN_URL_LABEL),
                type: 'ENGINE',
                term: this._get_open_url_keyword()
            });
        }

        if(!this.suggestions_box.isEmpty()) {
            this.suggestions_box.open();
        }
    },

    _activate_search: function(text) {
        this.suggestions_box.close();

        if(Utils.is_blank(text)) {
            this._show_hint({
                text: 'Error.\nPlease, enter a query.',
                icon_name: ICONS.error
            });

            return false;
        }

        this.search_history.add_item({
            query: text,
            type: "QUERY"
        });

        text = encodeURIComponent(text);
        let url = this.search_engine.url.replace('{term}', text);
        this._open_url(url);

        return true;
    },

    _open_url: function(url, to_history) {
        url = Utils.get_url(url);

        if(!url) {
            this._show_hint({
                text: 'Please, enter a valid url.',
                icon_name: ICONS.error
            });

            return false;
        }
        else {
            this.close();
        }

        if(to_history === true) {
            this.search_history.add_item({
                query: url,
                type: "NAVIGATION"
            });
        } 

        this.activate_window = true;

        Gio.app_info_launch_default_for_uri(
            url,
            Utils._makeLaunchContext({})
        );

        return true;
    },

    open: function() {
        this.parent();
        this.search_entry.grab_key_focus();

        this._show_hint({
            text: this._get_main_hint(),
            icon_name: ICONS.information
        });
    },

    close: function() {
        this._remove_delay_id();
        this._hide_engine_label();
        this.search_entry.set_text('');
        this.search_engine = false;
        this.suggestions_box.close();
        this.search_history.reset_index();

        this.parent();
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
        this._remove_delay_id();
        global.display.remove_keybinding(Prefs.OPEN_SEARCH_DIALOG_KEY);
        global.display.disconnect(this._window_handler_id);
    }
});

let search_dialog;

function init() {
    search_dialog = new WebSearchDialog();
}

function enable() {
    search_dialog.enable();
}

function disable() {
    search_dialog.disable();
}
