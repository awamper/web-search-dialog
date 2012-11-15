const St = imports.gi.St;
const Lang = imports.lang;
const Main = imports.ui.main;
const Clutter = imports.gi.Clutter;
const Gio = imports.gi.Gio;
const Soup = imports.gi.Soup;
const Params = imports.misc.params;
const RunDialog = imports.ui.runDialog;
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
            icon_name: 'edit-find',
            icon_type: St.IconType.SYMBOLIC
        });

        this._web_icon = new St.Icon({
            style_class: 'menu-item-icon',
            icon_name: 'web-browser',
            icon_type: St.IconType.SYMBOLIC
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
        this._search_dialog.suggestions_box.close(true);

        let url = null;

        if(menu_item._type == 'NAVIGATION') {
            url = menu_item._text.trim();
        }

        this._search_dialog._activate_search(false, url);

        return true;
    },

    _on_active_changed: function(menu_item) {
        this._search_dialog.show_suggestions = false;
        this._entry.set_text(menu_item._text);

        return true;
    },

    add_suggestion: function(text, type, relevance, term) {
        let item = new SuggestionMenuItem(text, type, relevance, term);
        item.connect('activate', Lang.bind(this, this._on_activated));
        item.connect('active-changed', Lang.bind(this, this._on_active_changed));
        this.addMenuItem(item)
    },

    close: function() {
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

const NewRunDialog = new Lang.Class({
    Name: 'NewRunDialog',
    Extends: RunDialog.RunDialog,

    _init: function() {
        this.parent();

        this._settings = Convenience.getSettings();
        this._clipboard = St.Clipboard.get_default();
        this.show_suggestions = true;
        this.search_engine = null;

        this._run_entry_signal_id = this._entryText.connect(
            'text-changed', 
            Lang.bind(this, function() {
                this._on_run_text_changed();
            })
        );

        this.run_label = this.contentLayout.get_child_at_index(0);
        this.default_run_label = this.run_label.get_text();
        this.run_dialog = this.contentLayout.get_child_at_index(1);

        this._create_search_entry();

        this.activate_window = false;
        this._window_handler_id = global.display.connect(
            'window-demands-attention',
            Lang.bind(this, this._on_window_demands_attention)
        );        
    },

    _on_window_demands_attention: function(display, window) {
        if(this.activate_window) {
            this.activate_window = false;
            Main.activateWindow(window);
        }
    },

    _create_search_entry: function() {
        this.search_engine_label = new St.Label({
            style_class: 'search-engine-label'
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
            Lang.bind(this, this._activate_search)
        );
        this.search_entry.get_clutter_text().connect(
            'text-changed', 
            Lang.bind(this, this._on_search_text_changed)
        );

        this.suggestions_box = new SuggestionsBox(this);
        this.suggestions_box.setSourceAlignment(0.02);

        this.search_history = new SearchHistoryManager();

        this._search_table = new St.Table({
            name: 'web_search_table',
            style_class: 'search-table'
        })
        this._search_table.add(this.search_engine_label, {
            row: 0,
            col: 0
        });
        this._search_table.add(this.search_entry, {
            row: 0,
            col: 1
        });
        this._search_table.hide();

        this.contentLayout.insert_child_at_index(this._search_table, 2);
    },

    _on_key_press: function(o, e) {
        let symbol = e.get_key_symbol();

        if(symbol == Clutter.Escape) {
            this.search_entry.set_text('');
            this._toggle_dialog();
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
        else if(symbol == Clutter.BackSpace) {
            let text = this.search_entry.get_text();

            if(Convenience.is_blank(text)) {
                this.search_entry.set_text('');
                this._toggle_dialog();
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
        else {
            // nothing
        }

        return true;
    },

    _toggle_dialog: function() {
        if(this._errorBox.visible) {
            this._errorBox.hide();
        }

        if(this.run_dialog.visible) {
            this.run_dialog.hide();
            this.run_label.set_text('Web Search');
            this._search_table.show();
            this.search_entry.grab_key_focus();
        }
        else {
            if(this.suggestions_box.isOpen) {
                this.suggestions_box.close();
            }

            this.run_label.set_text(this.default_run_label);
            this.run_dialog.set_text(this.run_dialog.get_text().trim());
            this.run_dialog.show();
            this.run_dialog.grab_key_focus();
            this.search_entry.set_text('');
            this._search_table.hide();
        }
    },

    _on_run_text_changed: function() {
        let text = this._entryText.get_text();
        this.search_engine = this._parse_query(text);

        if(!Convenience.is_blank(this.search_engine.url)) {
            this.run_label.set_text('Web Search');
            this._show_engine_label(this.search_engine.name+':');

            this._toggle_dialog();
        }
    },

    _parse_query: function(text) {
        let result = {
            name: null,
            keyword: null,
            url: null,
            open_url: false
        };
        let web_search_query_regexp = /^(.{1,}?)\s$/;

        if(web_search_query_regexp.test(text)) {
            let matches = web_search_query_regexp.exec(text);
            let keyword = matches[0];

            if(!Convenience.is_blank(keyword)) {
                result.keyword = keyword.trim();
                let engine = this._get_engine(result.keyword);

                if(engine) {
                    result.name = engine.name.trim();
                    result.url = engine.url.trim();

                    if(engine.open_url) {
                        result.open_url = true;
                    }
                }
            }
        }

        return result;
    },

    _get_engine: function(key) {
        if(Convenience.is_blank(key)) {
            return false;
        }

        let info;

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
                        return info;
                    }
                }
            }
        }

        return false;
    },

    _on_search_text_changed: function() {
        if(this._errorBox.visible) {
            let [errorBoxMinHeight, errorBoxNaturalHeight] =
                this._errorBox.get_preferred_height(-1);
            let parentActor = this._errorBox.get_parent();

            Tweener.addTween(parentActor,{
                height: parentActor.height - errorBoxNaturalHeight,
                time: 0.1,
                transition: 'easeOutQuad',
                onComplete: Lang.bind(this, function() {
                    this._errorBox.hide();
                    parentActor.set_height(-1);
                })
            });
        }

        if(this.show_suggestions) {
            let text = this.search_entry.get_text().trim();

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
                    if(this.suggestions_box.isOpen) {
                        this.suggestions_box.close();
                    }
                }

            }
            else {
                this._display_suggestions(text);
            }
        }
        else {
            this.show_suggestions = true;
        }
    },

    _show_engine_label: function(text) {
        this.search_engine_label.set_text(text);
        this.search_engine_label.show();
    },

    _hide_engine_label: function() {
        this.search_engine_label.hide();
        this.search_engine_label.set_text('');
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
            if(this.suggestions_box.isOpen) {
                this.suggestions_box.close();
            }

            return false;
        }

        text = text.trim();
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

                this.suggestions_box.open();
            }

            this._display_history_suggestions(text);

            return true;
        });

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

    _activate_search: function(text_obj, url) {
        if(this.suggestions_box.isOpen) {
            this.suggestions_box.close();
        }

        if(!Convenience.is_blank(url)) {
            this.search_history.add_item(url);

            this._toggle_dialog();
            this.close();
            this._run_search(url);

            return true;
        }
        else {
            let text = null;

            if(text_obj && !Convenience.is_blank(text_obj.get_text())) {
                text = text_obj.get_text().trim();
            }
            else {
                text = this.search_entry.get_text().trim();
            }

            if(Convenience.is_blank(text)) {
                return false;
            }

            if(!Convenience.is_blank(this.search_engine.url)) {
                this.search_history.add_item(text);

                if(!this.search_engine.open_url) {
                    text = encodeURIComponent(text);
                }

                if(this.search_engine.open_url) {
                    let url_regexp = imports.misc.util._urlRegexp;

                    if(!url_regexp.test(text)) {
                        this._showError('Please, enter a correct url.');

                        return false;
                    }
                }

                let url = this.search_engine.url.replace('{term}', text);
                this._toggle_dialog();
                this.close();
                this._run_search(url);

                return true;
            }
            else {
                this._showError('error');

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

    destroy: function () {
        this._entryText.disconnect(this._run_entry_signal_id);
        global.display.disconnect(this._window_handler_id);
    }
});

let old_run_dialog = null;

function init() {
    // nothing
}

function get_new_run_dialog() {
    if (Main.runDialog == null) {
        Main.runDialog = new NewRunDialog();
    }

    return Main.runDialog;
}

function enable() {
    Main.runDialog = null;
    old_run_dialog = Main.getRunDialog;
    Main.getRunDialog = get_new_run_dialog;
}

function disable() {
    Main.runDialog.destroy();
    Main.runDialog = null;
    Main.getRunDialog = old_run_dialog;
    old_run_dialog = null;
}
