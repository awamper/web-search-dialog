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
const PopupMenu = imports.ui.popupMenu;
const Tweener = imports.ui.tweener;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;
const Prefs = Me.imports.prefs;

const _httpSession = new Soup.SessionAsync();
Soup.Session.prototype.add_feature.call(
    _httpSession,
    new Soup.ProxyResolverDefault()
);
_httpSession.user_agent = 'Gnome-Shell Web Search';

const OPEN_URL_DATA = {
    url: '{term}',
    name: 'Open URL'
}

const SUGGESTIONS_URL = 
    "http://suggestqueries.google.com/complete/search?client=chrome&q=";
const SUGGESTIONS_DELAY = 150; // ms

const SuggestionMenuItem = new Lang.Class({
    Name: 'SuggestionMenuItem',
    Extends: PopupMenu.PopupBaseMenuItem,

    _init: function(text, type, relevance, term, params) {
        this.parent(params);

        this._text = text;
        this._type = type;
        this._relevance = relevance;
        this._term = term;

        this._find_icon = new St.Icon({
            style_class: 'menu-item-icon',
            icon_name: 'edit-find-symbolic'
        });

        this._web_icon = new St.Icon({
            style_class: 'menu-item-icon',
            icon_name: 'web-browser-symbolic'
        });

        let highlight_text = this._text.replace(
            new RegExp('(.*?)('+this._term+')(.*?)', "i"),
            "$1<b>$2</b>$3"
        );

        this._label = new St.Label({
            text: highlight_text
        });
        this._label.clutter_text.use_markup = true;

        this._box = new St.BoxLayout();

        if(this._type == 'NAVIGATION') {
            this._box.add(this._web_icon);
        }
        else {
            this._box.add(this._find_icon);
        }
        this._box.add(this._label);

        this.addActor(this._box);
        this.actor.label_actor = this._label
    },

    _onKeyPressEvent: function(actor, event) {
        let symbol = event.get_key_symbol();

        if (symbol == Clutter.Return || symbol == Clutter.KP_Enter) {
            this.activate(event);
            return true;
        }
        return false;
    }
});

const SuggestionsBox = new Lang.Class({
    Name: 'SuggestionsBox',
    Extends: PopupMenu.PopupMenu,

    _init: function(search_dialog) {
        this._search_dialog = search_dialog;
        this._entry = this._search_dialog.search_entry;

        this.parent(this._entry, 0, St.Side.TOP);

        Main.uiGroup.add_actor(this.actor);
        this.actor.hide();
    },

    _onKeyPressEvent: function (actor, event) {
        let symbol = event.get_key_symbol();

        if (symbol == Clutter.Escape) {
            this.close(true);
            return true;
        }
        else if(symbol == Clutter.BackSpace) {
            this._entry.grab_key_focus();
            this._search_dialog.show_suggestions = false;
            this._entry.set_text(this._entry.get_text().slice(0, -1));
            return true;
        }
        else if(symbol == Clutter.KP_Space || symbol == Clutter.KEY_space) {
            this._entry.grab_key_focus();
            this._search_dialog.show_suggestions = false;
            this._entry.set_text(this._entry.get_text() + ' ');
            return true;
        }
        else {
            return false;
        }
    },

    _on_activated: function(menu_item) {
        this._search_dialog._remove_delay_id();
        this._search_dialog.suggestions_box.close(true);

        if(menu_item._type == "ENGINE") {
            this._search_dialog._set_engine(menu_item._term);
        }
        else {
            let url = null;

            if(menu_item._type == 'NAVIGATION') {
                url = menu_item._text.trim();
            }

            this._search_dialog._activate_search({
                url: url
            });
        }

        return true;
    },

    _on_active_changed: function(menu_item) {
        this._search_dialog._remove_delay_id();

        if(menu_item._type != 'ENGINE') {
            this._search_dialog.show_suggestions = false;
            this._entry.set_text(menu_item._text);
        }

        return true;
    },

    add_suggestion: function(text, type, relevance, term) {
        let item = new SuggestionMenuItem(text, type, relevance, term);
        item.connect(
            'activate',
            Lang.bind(this, this._on_activated)
        );
        item.connect(
            'active-changed',
            Lang.bind(this, this._on_active_changed)
        );
        this.addMenuItem(item)
    },

    close: function() {
        this._search_dialog._remove_delay_id();
        this._entry.grab_key_focus();
        this.parent();
    }
});

const SearchHistoryManager = new Lang.Class({
    Name: "SearchHistoryManager",

    _init: function(params) {
        this._settings = Convenience.getSettings();

        params = Params.parse(params, {
            gsettings_key: Prefs.HISTORY_KEY,
            limit: this._settings.get_int(Prefs.HISTORY_LIMIT_KEY)
        });

        this._key = params.gsettings_key;
        this._limit = params.limit;

        if(this._key) {
            this._history = this._settings.get_strv(this._key);
            this._settings.connect(
                'changed::'+this._key,
                Lang.bind(this, this._history_changed)
            );
        }
        else {
            this._history = [];
        }

        this._history_index = this._history.length;
    },

    _history_changed: function() {
        this._history = this._settings.get_strv(this._key);
        this._history_index = this._history.length;
    },

    prev_item: function(text) {
        if(this._history_index <= 0) {
            return text;
        }

        if(text) {
            this._history[this._history_index] = text;
        }

        this._history_index--;

        return this._index_changed();
    },

    next_item: function(text) {
        if(this._history_index >= this._history.length) {
            return text;
        }

        if(text) {
            this._history[this._history_index] = text;
        }

        this._history_index++;

        return this._index_changed();
    },

    last_item: function() {
        if(this._history_index != this._history.length) {
            this._history_index = this._history.length;
            this._index_changed();
        }

        return this._history_index[this._history.length];
    },

    add_item: function(input) {
        if(this._history.length == 0 ||
            this._history[this._history.length - 1] != input) {

            this._history.push(input);
            this._save();
        }
        this._history_index = this._history.length;
    },

    get_best_matches: function(text, min_score, limit) {
        let result = [];
        let history = this._history;
        let unique_history = history.filter(function(elem, pos) {
            return history.indexOf(elem) == pos;
        })

        for(let i = 0; i < unique_history.length; i++) {
            let score = Convenience.string_score(text, unique_history[i], 0.5);

            if(score >= min_score) {
                result.push([score, unique_history[i]]);
            }
        }

        result.sort(function(a, b){return a[0] < b[0]});

        return result.slice(0, limit);

    },

    _index_changed: function() {
        let current = this._history[this._history_index] || '';

        return current;
    },

    _save: function() {
        if(this._history.length > this._limit) {
            this._history.splice(0, this._history.length - this._limit);
        }

        if(this._key) {
            this._settings.set_strv(this._key, this._history);
        }
    }
});

const WebSearchDialog = new Lang.Class({
    Name: 'WebSearchDialog',
    Extends: ModalDialog.ModalDialog,

    _init: function() {
        this.parent();
        this._dialogLayout.set_style_class_name('search-dialog');

        this._settings = Convenience.getSettings();
        this._clipboard = St.Clipboard.get_default();
        this._delay_suggestions_id = 0;
        this.show_suggestions = true;
        this.search_engine = false;

        this._open_hint = 
            'Type to search in {engine_name} or enter a keyword.\n'+
            'Press "space" for available search engines';
        this._create_search_dialog();

        this.activate_window = false;
        this._window_handler_id = global.display.connect(
            'window-demands-attention',
            Lang.bind(this, this._on_window_demands_attention)
        );        
    },

    _remove_delay_id: function() {
        if(this._delay_suggestions_id > 0) {
            Mainloop.source_remove(this._delay_suggestions_id);
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
        this._hint_box = new St.BoxLayout();
        this._hint_box.add(this.hint);
        this._hint_box.hide();

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
            Lang.bind(this, function(text) {
                let t = text.get_text();

                if(!Convenience.is_blank(t)) {
                    this._activate_search({
                        text: t
                    });
                }
            })
        );
        this.search_entry.get_clutter_text().connect(
            'text-changed', 
            Lang.bind(this, this._on_search_text_changed)
        );

        this.suggestions_box = new SuggestionsBox(this);
        this.suggestions_box.setSourceAlignment(0.02);

        this.search_history = new SearchHistoryManager();

        this._search_table = new St.Table({
            name: 'web_search_table'
        })
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

        if(symbol == Clutter.Escape) {
            this.close();
        }
        else if(symbol == Clutter.Tab) {
            if(this.suggestions_box.isOpen) {
                // let first_item = this.suggestions_box.firstMenuItem;
                // this.search_entry.set_text(first_item._text);
                // this.suggestions_box.close();
                this.suggestions_box.firstMenuItem.setActive(true);
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
                this.search_entry.set_text(item);
            }
        }
        else if(symbol == Clutter.Up) {
            if(!this.suggestions_box.isOpen) {
                this.show_suggestions = false;
                let text = this.search_entry.get_text();
                let item = this.search_history.prev_item(text);
                this.search_entry.set_text(item);
            }
        }
        // Ctrl+V
        else if(symbol == 118) {
            this._clipboard.get_text(Lang.bind(this, function(clipboard, text) {
                if (!text) {
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
        else if(symbol == 99) {
            let clutter_text = this.search_entry.get_clutter_text();
            let selection = clutter_text.get_selection();
            this._clipboard.set_text(selection);
        }
        // Ctrl+Shift+V - paste and search
        else if(symbol == 86) {
            this._set_engine();
            this._clipboard.get_text(Lang.bind(this, function(clipboard, text) {
                if (Convenience.is_blank(text)) {
                    return false;
                }
                else {
                    this._activate_search({
                        text: text
                    });

                    return true;
                }
            }));
        }
        // Ctrl+Shift+G - paste and go
        else if(symbol == 71) {
            this._set_engine();
            this._clipboard.get_text(Lang.bind(this, function(clipboard, text) {
                if (Convenience.is_blank(text)) {
                    return false;
                }
                else {
                    this._activate_search({
                        url: text
                    });

                    return true;
                }
            }));
        }
        else {
            // nothing
        }

        return true;
    },

    _on_search_text_changed: function() {
        this._remove_delay_id();
        let text = this.search_entry.get_text();

        if(text == ' ') {
            this._display_engines();
            return true;
        }

        if(Convenience.is_blank(text)) {
            let hint_text;

            if(this.search_engine != false) {
                if(!this.search_engine.open_url) {
                    hint_text = 
                        'Type to search in '+this.search_engine.name+'.\n'+
                        'Press "space" to switch search engine.'
                }
                else {
                    hint_text = 'Please, enter a URL.'
                }
            }
            else {
                let default_engine = this._get_default_engine();
                hint_text = this._open_hint.replace(
                    '{engine_name}',
                    default_engine.name
                )
            }

            this._show_hint({
                text: hint_text,
                icon_name: 'dialog-information-symbolic'
            })
            this.suggestions_box.close();
            this.show_suggestions = false;
        }
        else {
            this._hide_hint();
        }

        if(this.search_engine == false || this.search_engine._default) {
            let keyword = this._get_keyword(text);
            this._set_engine(keyword);

            if(!this.search_engine._default) {
                this.show_suggestions = false;
            }
        }

        if(this.show_suggestions) {
            text = text.trim();

            if(text.length <= 2) {
                return false;
            }

            if(this.search_engine.open_url) {
                let is_matches_protocol = 
                    Convenience.starts_with(
                        text, 'http://'.slice(0, text.length)
                    ) ||
                    Convenience.starts_with(
                        text, 'https://'.slice(0, text.length)
                    );

                if(!is_matches_protocol) {
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
                this._display_suggestions(text);
            }
        }
        else {
            this.show_suggestions = true;
        }

        return true;
    },

    _get_keyword: function(text) {
        let result = false;
        let web_search_query_regexp = /^(.{1,}?)\s$/;

        if(web_search_query_regexp.test(text)) {
            let matches = web_search_query_regexp.exec(text);
            let keyword = matches[0].trim();

            if(!Convenience.is_blank(keyword)) {
                result = keyword;
            }
        }

        return result;
    },

    _get_default_engine: function() {
        let engines = this._settings.get_strv(Prefs.ENGINES_KEY);
        let index = this._settings.get_int(Prefs.DEFAULT_ENGINE_KEY);
        let engine = JSON.parse(engines[index]);
        
        if(!Convenience.is_blank(engine.url)) {
            return engine;
        }
        else {
            return false;
        }
    },

    _get_engine: function(key) {
        if(Convenience.is_blank(key)) {
            return false;
        }

        let info;
        key = key.trim();

        if(key == this._settings.get_string(Prefs.OPEN_URL_KEY)) {
            info = {
                name: OPEN_URL_DATA.name,
                keyword: this._settings.get_string(Prefs.OPEN_URL_KEY),
                url: OPEN_URL_DATA.url,
                open_url: true
            };

            return info;
        }
        else {
            let engines_list = this._settings.get_strv(Prefs.ENGINES_KEY);

            for(let i = 0; i < engines_list.length; i++) {
                info = JSON.parse(engines_list[i]);

                if(info.keyword == key) {
                    if(info.url.length > 0) {
                        info.open_url = false;
                        return info;
                    }
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

        this.search_engine.keyword = engine.keyword.trim();
        this.search_engine.name = engine.name.trim();
        this.search_engine.url = engine.url.trim();
        this.search_engine.open_url = engine.open_url;

        if(engine_info) {
            this.search_entry.set_text('');
            this._show_engine_label(this.search_engine.name+':');
        }

        return true;
    },

    _show_hint: function(params) {
        params = Params.parse(params, {
            text: null,
            icon_name: 'dialog-information-symbolic'
        })

        if(Convenience.is_blank(params.text)) {
            return false;
        }
        if(this._hint_box.visible) {
            this._hide_hint();
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
        this.hint.set_text(params.text);

        let [hint_box_min_height, hint_box_natural_height] =
            this._hint_box.get_preferred_height(-1);
        this._hint_box.set_height(0);

        Tweener.addTween(this._hint_box, {
            height: hint_box_natural_height,
            time: 0.2,
            transition: 'easeOutQuad',
            onStart: Lang.bind(this, function() {
                Tweener.addTween(this._hint_box, {
                    opacity: 255,
                    time: 0.1,
                    transition: 'easeOutQuad'
                });
            }),
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
                time: 0.2,
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
        if(Convenience.is_blank(text)) {
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

        let [min_width, natural_width] =
            this.contentLayout.get_preferred_width(-1)

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

            if(Convenience.is_blank(text)) {continue;}
            if(Convenience.is_blank(type)) {continue;}
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

    _display_suggestions: function(text) {
        if(!this._settings.get_boolean(Prefs.SUGGESTIONS_KEY)) {
            return false;
        }
        if(!this.show_suggestions) {
            return false;
        }

        if(Convenience.is_blank(text)) {
            this.suggestions_box.close();

            return false;
        }

        this._remove_delay_id();
        this.suggestions_box.open();
        text = text.trim();

        this._delay_suggestions_id = Mainloop.timeout_add(
            SUGGESTIONS_DELAY,
            Lang.bind(this, function() {
                this._get_suggestions(text, function(suggestions) {
                    this.suggestions_box.removeAll();

                    if(suggestions) {
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

                            this.suggestions_box.add_suggestion(
                                suggestion.text,
                                suggestion.type,
                                suggestion.relevance,
                                text
                            );
                        }
                    }

                    this._display_history_suggestions(text);

                    // if(!this.suggestions_box.isEmpty()) {
                    //     this.suggestions_box.open();
                    // }
                    // else {
                    //     this.suggestions_box.close();
                    // }

                    return true;
                });
            })
        );

        return true;
    },

    _display_history_suggestions: function(text) {
        if(!this._settings.get_boolean(Prefs.HISTORY_SUGGESTIONS_KEY)) {
            return false;
        }

        let history_suggestions = this.search_history.get_best_matches(
            text,
            0.45,
            3
        );

        if(history_suggestions.length > 0) {
            this.suggestions_box.addMenuItem(
                new PopupMenu.PopupMenuItem('History:', {
                    reactive: false,
                    activate: false,
                    hover: false,
                    sensitive: false
                })
            );

            for(let i = 0; i < history_suggestions.length; i++) {
                this.suggestions_box.add_suggestion(
                    history_suggestions[i][1],
                    'QUERY',
                    history_suggestions[i][0],
                    text
                );
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

            if(this.search_engine.keyword == engine.keyword) {
                continue;
            }

            this.suggestions_box.add_suggestion(
                engine.name,
                'ENGINE',
                0,
                engine.keyword
            );
        }

        if(!this.suggestions_box.isEmpty()) {
            this.suggestions_box.open();
        }
    },

    _activate_search: function(params) {
        this.suggestions_box.close();

        params = Params.parse(params, {
            text: null,
            url: null
        })

        if(!Convenience.is_blank(params.url)) {
            let url = Convenience.get_url(params.url);
            this.search_history.add_item(url);
            this.close();
            this._run_search(url);

            return true;
        }
        else {
            let text = null;

            if(!Convenience.is_blank(params.text)) {
                text = params.text;
            }
            else {
                text = this.search_entry.get_text().trim();
            }
            if(Convenience.is_blank(text)) {
                this._show_hint({
                    text: 'Error.\nPlease, enter a query.',
                    icon_name: 'dialog-error-symbolic'
                });
                return false;
            }

            if(!Convenience.is_blank(this.search_engine.url)) {
                this.search_history.add_item(text);

                if(!this.search_engine.open_url) {
                    text = encodeURIComponent(text);
                }

                if(this.search_engine.open_url) {
                    text = Convenience.get_url(text);

                    if(!text) {
                        this._show_hint({
                            text: 'Please, enter a valid url.',
                            icon_name: 'dialog-error-symbolic'
                        });

                        return false;
                    }
                }

                let url = this.search_engine.url.replace('{term}', text);
                this.close();
                this._run_search(url);

                return true;
            }
            else {
                this._show_hint({
                    text: 'Error.\nSearch engine doesn\'t have a url.',
                    icon_name: 'dialog-error-symbolic'
                });

                return false;
            }
        }
    },

    _run_search: function(url) {
        if(!Convenience.is_blank(url)) {
            this.activate_window = true;

            Gio.app_info_launch_default_for_uri(
                url,
                Convenience._makeLaunchContext({})
            );

            if(Main.overview.visible) {
                Main.overview.hide();
            }

            return true;
        }

        return false;
    },

    open: function() {
        this.parent();
        this.search_entry.grab_key_focus();

        let default_engine = this._get_default_engine();
        let hint_text = 
            this._open_hint.replace('{engine_name}', default_engine.name);
        this._show_hint({
            text: hint_text,
            icon_name: 'dialog-information-symbolic'
        });
    },

    close: function() {
        this._remove_delay_id();
        this._hide_engine_label();
        this.search_entry.set_text('');
        this.search_engine = false;

        this.parent();
    },

    enable: function() {
        global.display.add_keybinding(
            'open-web-search-dialog',
            this._settings,
            Meta.KeyBindingFlags.NONE,
            Lang.bind(this, function() {
                this.open();
            })
        );
    },

    disable: function() {
        this._remove_delay_id();
        global.display.remove_keybinding('open-web-search-dialog');
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
