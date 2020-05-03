const GObject = imports.gi.GObject;
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
const Shell = imports.gi.Shell;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Suggestions = Me.imports.suggestions_box;
const Helper = Me.imports.helper;
const Utils = Me.imports.utils;
const HistoryManager = Me.imports.history_manager;
const Prefs = Me.imports.prefs;

const _httpSession = Utils._httpSession;
const ICONS = Utils.ICONS;

const MAX_SUGGESTIONS = 3;
const SUGGESTIONS_URL =
    "https://suggestqueries.google.com/complete/search?client=chrome&q=";

const SETTINGS_ICON = 'emblem-system-symbolic';

function launch_extension_prefs(uuid) {
    let appSys = Shell.AppSystem.get_default();
    let app = appSys.lookup_app('org.gnome.Shell.Extensions.desktop');
    let info = app.get_app_info();
    let timestamp = global.display.get_current_time_roundtrip();
    info.launch_uris(
        ['extension:///' + uuid],
        global.create_app_launch_context(timestamp, -1)
    );
}
const WebSearchDialog = GObject.registerClass (class WebSearchDialog extends ModalDialog.ModalDialog {
    _init() {
        super._init({
            destroyOnClose: false
        });
        this._dialogLayout =
            typeof this.dialogLayout === "undefined"
            ? this._dialogLayout
            : this.dialogLayout;

        this._dialogLayout.set_style_class_name('');
        this._dialogLayout.set_margin_bottom(300);
        this.contentLayout.set_style_class_name('web-search-dialog');

        this._settings = Utils.getSettings();
        this._clipboard = St.Clipboard.get_default();
        this._suggestions_delay_id = 0;
        this._helper_delay_id = 0;
        this.show_suggestions = true;
        this.select_first_suggestion = true;
        this.search_engine = false;

        this._create_search_dialog();

        this.activate_window = false;
        this._window_handler_id = global.display.connect(
            'window-demands-attention',
            Lang.bind(this, this._on_window_demands_attention)
        );
    }

    _resize() {
        let monitor = Main.layoutManager.currentMonitor;
        let is_primary = monitor.index === Main.layoutManager.primaryIndex;

        let available_width = monitor.width;
        let available_height = monitor.height;
        if(is_primary) available_height -= Main.panel.height;

        let width = Math.round(available_width / 100 * 85);

        this._dialogLayout.set_width(width);
    }

    _reposition() {
        let monitor = Main.layoutManager.currentMonitor;
        this._dialogLayout.x = Math.round(monitor.width / 2 - this._dialogLayout.width / 2);
        this._dialogLayout.y = 100;
    }

    _get_main_hint() {
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
    }

    _remove_delay_id() {
        if(this._suggestions_delay_id > 0) {
            Mainloop.source_remove(this._suggestions_delay_id);
            this._suggestions_delay_id = 0;
        }
        if(this._helper_delay_id > 0) {
            Mainloop.source_remove(this._helper_delay_id);
            this._helper_delay_id = 0;
        }
    }

    _on_window_demands_attention(display, window) {
        if(this.activate_window) {
            this.activate_window = false;
            Main.activateWindow(window);
        }
    }

    _create_search_dialog() {
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
            style_class: 'web-search-entry'
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

        let secondary_icon = new St.Icon({
            icon_name: SETTINGS_ICON,
            style_class: 'settings-icon'
        });
        this.search_entry.set_secondary_icon(secondary_icon);
        this.search_entry.connect('secondary-icon-clicked',
            Lang.bind(this, function() {
                this.close();
                launch_extension_prefs(Me.uuid);
            }
        ));

        this.duckduckgo_helper = new Helper.DuckDuckGoHelper();
        this.suggestions_box = new Suggestions.SuggestionsBox(this);
        this.suggestions_box.setSourceAlignment(0.02);

        this.search_history = new HistoryManager.SearchHistoryManager();

        this._search_table = new St.Widget({
            name: 'web_search_table',
            layout_manager: new Clutter.GridLayout({ orientation: Clutter.Orientation.VERTICAL })
        });
        let search_table_layout = this._search_table.layout_manager;
        search_table_layout.attach(this.search_engine_label, 0, 0, 1, 1);
        search_table_layout.attach(this.search_entry, 1, 0, 1, 1);
        this._search_table.show();

        this.contentLayout.add(this._search_table);
        this.contentLayout.add(this._hint_box);
    }

    _on_key_press(o, e) {
        let symbol = e.get_key_symbol();
        let control_mask = (e.get_state() & Clutter.ModifierType.CONTROL_MASK);
        let shift_mask = (e.get_state() & Clutter.ModifierType.SHIFT_MASK);

        if(symbol == Clutter.KEY_Escape) {
            this.close();
        }
        else if(symbol == Clutter.KEY_Tab) {
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
        else if(symbol == Clutter.KEY_Down) {
            if(this.suggestions_box.isOpen) {
                if(this._settings.get_boolean(Prefs.SELECT_FIRST_SUGGESTION)) {
                    let items = this.suggestions_box._getMenuItems();

                    if(items.length > 1) {
                        items[0].remove_style_pseudo_class('active');
                        items[1].setActive(true);
                    }
                }
                else {
                    this.suggestions_box.firstMenuItem.setActive(true);
                }
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
        else if(symbol == Clutter.KEY_Up) {
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
            this._clipboard.get_text(St.ClipboardType.PRIMARY, Lang.bind(this, function(clipboard, text) {
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
            this._clipboard.set_text(St.ClipboardType.PRIMARY, selection);
        }
        // Ctrl+Shift+V - paste and search
        else if(control_mask && shift_mask && symbol == 86) {
            if(!this.search_engine) {
                this._set_engine();
            }

            this._clipboard.get_text(St.ClipboardType.PRIMARY, Lang.bind(this, function(clipboard, text) {
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

            this._clipboard.get_text(St.ClipboardType.PRIMARY, Lang.bind(this, function(clipboard, url) {
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
    }

    _on_text_activate(text) {
        text = text.get_text();

        if(!Utils.is_blank(text)) {
            if(this.search_engine.open_url) {
                this._open_url(text, true);
            }
            else {
                this._activate_search(text);
            }
        }
    }

    _on_text_key_press(o, e) {
        let symbol = e.get_key_symbol();

        // reset the search engine on backspace with empty search text
        if(
            symbol == Clutter.KEY_BackSpace &&
            !this.search_entry.text.length &&
            !this.search_engine._default
        ) {
            this._set_engine(false);
            this._on_search_text_changed(); // trigger update of hint
        }
        else if(symbol == Clutter.KEY_BackSpace) {
            this.select_first_suggestion = false;
        }
        else if(symbol == Clutter.KEY_Right) {
            let sel = this.search_entry.clutter_text.get_selection_bound();

            if(sel === -1) {
                this.search_entry.clutter_text.set_cursor_position(
                    this.search_entry.text.length
                );
            }
        }
    }

    _on_search_text_changed() {
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
    }

    _get_open_url_keyword() {
        let key = this._settings.get_string(Prefs.OPEN_URL_KEY);

        if(Utils.is_blank(key)) {
            return false;
        }
        else {
            return key.trim();
        }
    }

    _get_keyword(text) {
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
    }

    _get_default_engine() {
        let engines = this._settings.get_strv(Prefs.ENGINES_KEY);
        let index = this._settings.get_int(Prefs.DEFAULT_ENGINE_KEY);
        let engine = JSON.parse(engines[index]);

        if(!Utils.is_blank(engine.url)) {
            return engine;
        }
        else {
            return false;
        }
    }

    _get_engine(key) {
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
    }

    _set_engine(keyword) {
        this._remove_delay_id();

        let engine_info = this._get_engine(keyword);
        let engine = {};

        if(engine_info) {
            engine = engine_info;
            this.search_engine._default = false;
        }
        else {
            engine = this._get_default_engine();
            engine._default = true;
        }

        if(
            engine.keyword === this.search_engine.keyword ||
            this.search_engine._default && engine._default
        ) {
            return false;
        }

        this.search_engine = {};
        this.search_engine._default = engine._default;
        this.search_engine.keyword = engine.keyword.trim();
        this.search_engine.open_url = engine.open_url;
        this.search_engine.name = engine.name.trim();
        this.search_engine.url = !engine.open_url
            ? engine.url.trim()
            : null

        // update the label any time we set an engine
        this._show_engine_label(this.search_engine.name+':');

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
            this._show_hint({
                text: hint_text,
                icon_name: ICONS.information
            });
        }

        return true;
    }

    _show_hint(params) {
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
    }

    _hide_hint() {
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
    }

    _show_engine_label(text) {
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
    }

    _hide_engine_label() {
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
    }

    _parse_suggestions(suggestions_source) {
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
    }

    _get_suggestions(text, callback) {
        let url = SUGGESTIONS_URL+encodeURIComponent(text);
        let here = this;

        let request = Soup.Message.new('GET', url);
        request.request_headers.append("Accept", "application/json;charset=utf-8");

        _httpSession.queue_message(request, function(_httpSession, message) {
            if(message.status_code === 200) {
                let result = JSON.parse(request.response_body.data);

                if(result[1].length < 1) {
                    callback.call(here, text, false);
                }
                else {
                    callback.call(here, text, result);
                }
            }
            else {
                callback.call(here, text, false);
            }
        });
    }

    _display_helper(text) {
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
    }

    _display_suggestions(text) {
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
                this._get_suggestions(text, function(term, suggestions) {
                    this.suggestions_box.remove_all_by_types('ALL');

                    if(!suggestions) {
                        this.suggestions_box.close();
                        return false;
                    }
                    if(this.search_entry.text != term) return false;

                    if(this.search_entry.text != term) return false;

                    suggestions = this._parse_suggestions(suggestions);

                    if(!suggestions){return false;}

                    for(let i = 0; i < MAX_SUGGESTIONS; i++) {
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
                        if(this.select_first_suggestion) {
                            this._select_first_suggestion(text);
                        }
                        else {
                            this.select_first_suggestion = true;
                        }
                    }

                    return true;
                });
            })
        );

        return true;
    }

    _select_first_suggestion(text) {
        if(!this._settings.get_boolean(Prefs.SELECT_FIRST_SUGGESTION)) return false;
        if(text.slice(-1) == ' ') return false;

        let item = this.suggestions_box.firstMenuItem;

        let suggestion_t = item._text.slice(0, text.length).toUpperCase();
        let source_t = text.toUpperCase();

        if(suggestion_t != source_t) {
            return false;
        }

        this.show_suggestions = false;
        this.search_entry.set_text(item._text);
        this.search_entry.clutter_text.set_selection(
            text.length,
            item._text.length
        );
        item.add_style_pseudo_class('active');

        this._display_helper(text);

        return true;
    }

    _display_history_suggestions(text) {
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
    }

    _display_engines() {
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
    }

    _activate_search(text) {
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
    }

    _open_url(url, to_history) {
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
    }

    open() {
        super.open();
        this.search_entry.grab_key_focus();
        this._set_engine();
        this._show_hint({
            text: this._get_main_hint(),
            icon_name: ICONS.information
        });

        this._resize();
        this._reposition();
        this._is_open = true;
    }

    close() {
        this._remove_delay_id();
        this._hide_engine_label();
        this.search_entry.set_text('');
        this.search_engine = false;
        this.suggestions_box.close();
        this.search_history.reset_index();
        this._is_open = false;

        super.close();
    }

    toggleOpen() {
      this._is_open ? this.close() : this.open();
    }

    enable() {
        Main.wm.addKeybinding(
            Prefs.OPEN_SEARCH_DIALOG_KEY,
            this._settings,
            Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.NORMAL |
            Shell.ActionMode.OVERVIEW |
            Shell.ActionMode.SYSTEM_MODAL,
            Lang.bind(this, this.toggleOpen)
        );
    }

    disable() {
        this._remove_delay_id();
        Main.wm.removeKeybinding(Prefs.OPEN_SEARCH_DIALOG_KEY);
        global.display.disconnect(this._window_handler_id);
        this.destroy();
    }
});

let search_dialog = null;

function init() {
    // nothing
}

function enable() {
    if(search_dialog === null) {
        search_dialog = new WebSearchDialog();
        search_dialog.enable();
    }
}

function disable() {
    search_dialog.disable();
    search_dialog = null;
}
