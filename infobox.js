const St = imports.gi.St;
const Lang = imports.lang;
const Main = imports.ui.main;
const Mainloop = imports.mainloop;
const Clutter = imports.gi.Clutter;
const PopupMenu = imports.ui.popupMenu;
const Panel = imports.ui.panel;
const Params = imports.misc.params;
const Tweener = imports.ui.tweener;
const Signals = imports.signals;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Prefs = Me.imports.prefs_keys;
const SearchEngines = Me.imports.search_engines;
const SuggestionsSystem = Me.imports.suggestions_system;
const HelpersSystem = Me.imports.helpers_system;
const HelpersBase = Me.imports.helpers_base;
const Utils = Me.imports.utils;

const ICONS = Utils.ICONS;
const INFOBOX_TYPES = {
    ALL: 0,
    SPINNER: 1,
    LABEL: 2,
    SUGGESTIONS_QUERY: 3,
    SUGGESTIONS_NAVIGATION: 4,
    HISTORY_QUERY: 5,
    HISTORY_NAVIGATION: 6,
    HELPER: 7,
    SEARCH_ENGINE: 8
};
const SUGGESTIONS_TYPES = [
    INFOBOX_TYPES.SUGGESTIONS_NAVIGATION,
    INFOBOX_TYPES.SUGGESTIONS_QUERY,
    INFOBOX_TYPES.HISTORY_NAVIGATION,
    INFOBOX_TYPES.HISTORY_QUERY
];
const HELPER_POSITIONS = {
    TOP: 0,
    BOTTOM: 1
};

const SpinnerMenuItem = Lang.Class({
    Name: 'InfoboxSpinner',
    Extends: PopupMenu.PopupBaseMenuItem,

    _init: function(text) {
        this.parent({
            reactive: false,
            activate: false,
            hover: false,
            sensitive: false
        });
        this.type = INFOBOX_TYPES.SPINNER;

        let spinner = new Panel.AnimatedIcon(
            'process-working.svg',
            24
        );
        spinner.actor.show();

        let label = new St.Label({
            text: Utils.is_blank(text) ? 'Loading...' : text
        });

        let box = new St.BoxLayout({
            style_class: 'infobox-spinner'
        });
        box.add(spinner.actor);
        box.add(label);

        this.addActor(box);
    }
});

const EngineMenuItem = new Lang.Class({
    Name: 'EngineMenuItem',
    Extends: PopupMenu.PopupBaseMenuItem,

    _init: function(name, keyword, params) {
        this.parent(params);

        this.type = INFOBOX_TYPES.SEARCH_ENGINE;
        this.name = name;
        this.text = '';
        this.keyword = keyword;

        let label_text =
            name+'<span size="xx-small" color="grey"><sup>'+keyword+'</sup></span>';
        let label = new St.Label({
            text: label_text,
            style_class: 'menu-item-engine-name'
        });
        label.clutter_text.use_markup = true;

        let icon = new St.Icon({
            style_class: 'menu-item-icon',
            icon_name: ICONS.find
        });

        let box = new St.BoxLayout();
        box.add(icon);
        box.add(label);

        this.addActor(box);
        this.actor.label_actor = label;
    },

    _onKeyPressEvent: function(actor, event) {
        let symbol = event.get_key_symbol();

        if(symbol == Clutter.Return || symbol == Clutter.KP_Enter) {
            this.activate(event);
        }
    }
});

const HelpersBox = new Lang.Class({
    Name: 'HelpersBox',

    _init: function() {
        this._helpers = [];
        this._current = 0;

        this.actor = new St.Table({
            style_class: 'helpers-box'
        });
        this.actor.hide();

        this._helpers_box = new St.BoxLayout();

        this._name_label = new St.Label();
        this._helpers_counter_label = new St.Label();
        this._title_box = new St.BoxLayout({
            style_class: 'helper-title'
        });
        this._title_box.add(this._name_label);
        this._title_box.add(this._helpers_counter_label);

        this.actor.add(this._title_box, {
            row: 0,
            col: 0,
            x_fill: false,
            x_align: St.Align.START
        });
        this.actor.add(this._helpers_box, {
            row: 1,
            col: 0
        });
        this.signal_id =
            this.connect('helper-added', Lang.bind(this, this._on_helper_added));
    },

    _on_helper_added: function(o, helper_box) {
        if(!this.is_empty() && !this.actor.visible) {
            this.show();
        }

        this._show_helper(this._current);
        this._update_title();
    },

    _update_title: function() {
        this._name_label.set_text(this._helpers[this._current].name);
        this._helpers_counter_label.set_text(
            ' '+(this._current + 1).toString() + ' of '+
            this._helpers.length.toString()
        );
    },

    _show_helper: function(helper_index) {
        helper_index = parseInt(helper_index, 10);

        if(this._helpers[helper_index] === undefined) {
            return false;
        }
        else if (
            this._helpers_box.get_first_child() == this._helpers[helper_index].actor
        ) {
            return true;
        }
        else {
            let helper_actor = this._helpers[helper_index].actor;
            helper_actor.opacity = 0;
            helper_actor.show();
            this._current = helper_index;

            if(this._helpers_box.get_n_children() > 0) {
                this._helpers_box.replace_child(
                    this._helpers_box.get_first_child(),
                    helper_actor
                );
            }
            else {
                this._helpers_box.add(helper_actor);
            }

            Tweener.addTween(helper_actor, {
                time: 0.3,
                opacity: 255,
                transition: 'easeOutQuad'
            });
            this._update_title();

            return true;
        }
    },

    show_spinner: function() {
        this.spinner = new Panel.AnimatedIcon('process-working.svg', 24);

        if(this.is_empty()) {
            this._name_label.set_text('Checking helpers');
        }
        
        this._title_box.add(this.spinner.actor);
        this.spinner.actor.show();
    },

    hide_spinner: function() {
        this.spinner.actor.destroy();
    },

    is_empty: function() {
        return this._helpers.length === 0;
    },

    is_open: function() {
        this.actor.visible;
    },

    add_helper: function(helper_box) {
        if(!helper_box instanceof HelpersBase.HelperBoxBase) {
            log('Invalid helper_box');
            return;
        }

        this._helpers.push(helper_box);
        this.emit('helper-added', helper_box);
    },

    show_next: function() {
        let next_index = this._current + 1;
        return this._show_helper(next_index);
    },

    show_prev: function() {
        let prev_index = this._current - 1;
        return this._show_helper(prev_index);
    },

    clear: function() {
        this._helpers_box.remove_all_children();

        if(!this.is_empty()) {
            for(let i = 0; i < this._helpers.length; i++) {
                this._helpers[i].actor.destroy();
            }
        }

        this._helpers.length = 0;
        this._current = 0;
    },

    hide: function() {
        if(!this.is_empty()) this.clear();
        if(this.actor.visible) this.actor.hide();
    },

    show: function() {
        this.actor.show_all();
    },
});
Signals.addSignalMethods(HelpersBox.prototype);

const Infobox = new Lang.Class({
    Name: 'Infobox',
    Extends: PopupMenu.PopupMenu,

    _init: function(search_entry) {
        this._entry = search_entry;

        this.parent(this._entry, 0, St.Side.TOP);

        this.helpers = new HelpersBox();
        this.helpers_menu_item = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            activate: false,
            hover: false,
            sensitive: false
        });
        this.helpers_menu_item.addActor(this.helpers.actor);
        this.helpers_menu_item.type = INFOBOX_TYPES.HELPER;
        this.helpers_menu_item.name = 'HELPERS';
        this.addMenuItem(this.helpers_menu_item);

        Main.uiGroup.add_actor(this.actor);
        this.actor.hide();
        this.setSourceAlignment(0.02)
    },

    _on_menu_item_destroyed: function() {
        this.emit('menu-item-removed');
    },

    is_open: function() {
        return this.isOpen;
    },

    is_empty: function() {
        return this.isEmpty();
    },

    addMenuItem: function(menu_item, position) {
        menu_item.connect('destroy', Lang.bind(this, this._on_menu_item_destroyed));
        this.parent(menu_item, position);
        this.emit('menu-item-added', menu_item);
    },

    remove_menu_item: function(menu_item) {
        if(menu_item._popupMenuDestroyId > 0) {
            menu_item.disconnect(menu_item._popupMenuDestroyId);
        }
        if(menu_item._activateId > 0) {
            menu_item.disconnect(menu_item._activateId);
        }
        if(menu_item._activeChangeId > 0) {
            menu_item.disconnect(menu_item._activeChangeId);
        }
        if(menu_item._sensitiveChangeId > 0) {
            menu_item.disconnect(menu_item._sensitiveChangeId);
        }
        if(menu_item.activate_signal_id > 0) {
            menu_item.disconnect(menu_item.activate_signal_id);
        }
        if(menu_item.active_changed_signal_id > 0) {
            menu_item.disconnect(menu_item.active_changed_signal_id);
        }

        if(menu_item == this._activeMenuItem) this._activeMenuItem = null;

        this.box.remove_child(menu_item.actor);
        this.emit('menu-item-removed');
    },

    add_label: function(text, position) {
        let menu_item = new PopupMenu.PopupMenuItem(text, {
            reactive: false,
            activate: false,
            hover: false,
            sensitive: false
        });
        menu_item.type = INFOBOX_TYPES.LABEL;
        this.addMenuItem(menu_item, position);
    },

    is_exists_spinner: function(spinner_id) {
        let children = this._getMenuItems();
        let result = false;

        for(let i = 0; i < children.length; i++) {
            if(children[i].spinner_id === spinner_id) {
                result = true;
                break;
            }
        }

        return result;
    },

    show_spinner: function(text, spinner_id, position) {
        if(!this.is_exists_spinner(spinner_id)) {
            let menu_item = new SpinnerMenuItem(text);
            menu_item.type = INFOBOX_TYPES.SPINNER;
            menu_item.spinner_id = spinner_id;
            this.addMenuItem(menu_item, position);
        }
    },

    hide_spinner: function(spinner_id) {
        let children = this._getMenuItems();

        for(let i = 0; i < children.length; i++) {
            let item = children[i];

            if(item.spinner_id == spinner_id) {
                item.destroy();
            }
        }
    },

    remove_all_by_types: function(types_array) {
        let children = this._getMenuItems();

        for(let i = 0; i < children.length; i++) {
            let item = children[i];

            if(types_array === INFOBOX_TYPES.ALL) {
                if(item.activate_signal_id > 0) {
                    item.disconnect(item.activate_signal_id);
                }
                if(item.active_changed_signal_id) {
                    item.disconnect(item.active_changed_signal_id);
                }
                item.destroy();
            }
            else if(types_array.indexOf(item.type) > -1) {
                if(item.activate_signal_id > 0) {
                    item.disconnect(item.activate_signal_id);
                }
                if(item.active_changed_signal_id) {
                    item.disconnect(item.active_changed_signal_id);
                }
                item.destroy();
            }
            else {
                continue;
            }
        }
    },

    close: function() {
        this.helpers.clear();
        this._entry.grab_key_focus();
        this.parent(true);
    },
});

const TIMEOUT_NAMES = {
    SUGGESTIONS: 'suggestions_timeout_id',
    HELPERS: 'helpers_timeout_id'
};
const InfoboxManager = new Lang.Class({
    Name: 'InfoboxManager',

    _init: function(search_dialog) {
        if(Utils.is_blank(search_dialog)) {
            throw new Error('Invalid search_dialog');
            return;
        }

        this.connect(
            'suggestions-recieved',
            Lang.bind(this, this._on_suggestions_recieved)
        );
        this.connect(
            'helpers-recieved',
            Lang.bind(this, this._on_helpers_recieved)
        );

        this._settings = Utils.getSettings();
        this._search_dialog = search_dialog;
        this._entry = this._search_dialog.entry;
        this._entry.get_clutter_text().connect(
            'key-press-event',
            Lang.bind(this, this._on_text_key_press)
        );

        this._box = new Infobox(this._entry);
        this._box.connect(
            'menu-item-added',
            Lang.bind(this, this._on_menu_item_added)
        );
        this._box.connect(
            'menu-item-removed',
            Lang.bind(this, this._on_menu_item_removed)
        );
        this._box.actor.connect(
            'key-press-event',
            Lang.bind(this, this._on_box_key_press)
        );

        this._suggestions_system = new SuggestionsSystem.SuggestionsSystem();
        this._helpers_system = new HelpersSystem.HelpersSystem();

        this.show_helpers_trigger = true;
        this.show_suggestions_trigger = true;
        this.select_first_suggestion_trigger = true;

        this._timeout_ids = [];
        this._timeout_ids[TIMEOUT_NAMES.SUGGESTIONS] = 0;
        this._timeout_ids[TIMEOUT_NAMES.HELPERS] = 0;
    },

    _remove_timeout_ids: function(ids_array) {
        if(ids_array === undefined) {
            for(let key in this._timeout_ids) {
                if(this._timeout_ids[key] > 0) {
                    Mainloop.source_remove(this._timeout_ids[key]);
                    this._timeout_ids[key] = 0;
                }
            }
        }
        else if(ids_array instanceof String && this._timeout_ids[ids_array] > 0) {
            Mainloop.source_remove(this._timeout_ids[ids_array]);
            this._timeout_ids[ids_array] = 0;
        }
        else if(ids_array instanceof Array) {
            if(ids_array.length > 0) {
                for(let i = 0; i < ids_array.length; i++) {
                    if(this._timeout_ids[ids_array[i]] > 0) {
                        Mainloop.source_remove(this._timeout_ids[ids_array[i]]);
                        this._timeout_ids[ids_array[i]] = 0;
                    }
                }
            }
        }
        else {
            // nothing
        }
    },

    _on_helpers_recieved: function() {
        if(this._box.helpers.is_empty()) {
            this._box.helpers.hide();
        }
    },

    _on_suggestions_recieved: function() {
        this.update_helpers_position();
    },

    _on_menu_item_added: function(object, menu_item) {
        if(!this._box.isOpen) {
            this._box.open(true);
        }
    },

    _on_menu_item_removed: function() {
        if(this._box.isEmpty()) {
            this._box.close(true);
        }
    },

    _on_box_key_press: function(object, event) {
        let symbol = event.get_key_symbol();

        if(symbol == Clutter.Escape) {
            this._box.close(true);
        }
        else if(symbol == Clutter.BackSpace) {
            this._entry.grab_key_focus();
            this.show_suggestions_trigger = false;
            this.select_first_suggestion_trigger = false;
            this._entry.set_text(this._entry.get_text().slice(0, -1));
        }
        else {
            let skip_keys = (
                symbol == Clutter.Up ||
                symbol == Clutter.Down ||
                symbol == Clutter.Tab
            );

            if(!skip_keys) {
                let ch = Utils.get_unichar(symbol);
                let text = this._entry.get_text();
                this._entry.grab_key_focus();

                if(ch) {
                    this._entry.set_text(text + ch);
                }
            }
        }
    },

    _on_text_key_press: function(o, e) {
        let symbol = e.get_key_symbol();
        let alt_mask = (e.get_state() & Clutter.ModifierType.MODIFIER_MASK);

        if(alt_mask) {
            if(!this._box.helpers.is_empty()) {
                if(symbol == Clutter.Right) this._box.helpers.show_next();
                if(symbol == Clutter.Left) this._box.helpers.show_prev();
            }
        }
        else if(symbol == Clutter.BackSpace) {
            this.select_first_suggestion_trigger = false;
        }
        else if(symbol == Clutter.Right) {
            let sel = this._entry.clutter_text.get_selection_bound();

            if(sel === -1) {
                this._entry.clutter_text.set_cursor_position(
                    this._entry.text.length
                );
            }
        }

        return false;
    },

    _on_activated: function(menu_item) {
        this._remove_timeout_ids();
        this.emit('suggestion-activated', menu_item);
    },

    _on_active_changed: function(menu_item, active) {
        if(active) {
            this.show_suggestions_trigger = false;
            this.show_helpers_trigger = false;
            this._entry.set_text(menu_item.text);
        }
    },

    _connect_menu_item_signals: function(menu_item) {
        menu_item.activate_signal_id = menu_item.connect(
            'activate',
            Lang.bind(this, this._on_activated)
        );
        menu_item.active_changed_signal_id = menu_item.connect(
            'active-changed',
            Lang.bind(this, this._on_active_changed)
        );
    },

    _select_first_suggestion: function(current_term) {
        if(this.select_first_suggestion_trigger) {
            let item = this._box.firstMenuItem;

            if(SUGGESTIONS_TYPES.indexOf(item.type) === -1) {
                item = null;
                let items = this._box._getMenuItems();

                for(let i = 0; i < items.length; i++) {
                    if(SUGGESTIONS_TYPES.indexOf(items[i].type) != -1) {
                        item = items[i];
                        break;
                    }
                }
            }

            if(item == null || item.text == current_term) return;

            if(current_term.slice(-1) != ' ') {
                let suggestion_text =
                    item.text.slice(0, current_term.length).toUpperCase();

                if(suggestion_text != current_term.toUpperCase()) return;

                this.show_suggestions_trigger = false;
                this.show_helpers_trigger = false;
                item.setActive(true, {
                    grabKeyboard: false
                });
                this._entry.clutter_text.set_selection(
                    current_term.length,
                    item.text.length
                );
            }
        }
        else {
            this.select_first_suggestion_trigger = true;
        }
    },

    _highlight_suggestions: function(term) {
        let suggestions = this._box._getMenuItems();

        for(let i = 0; i < suggestions.length; i++) {
            let clutter_text = suggestions[i].label.clutter_text;
            let highlighted_text = suggestions[i].highlight_text(term);
            clutter_text.set_markup(highlighted_text);
        }
    },

    _get_suggestions: function(suggestions_engine, term, limit) {
        this._box.remove_all_by_types([
            INFOBOX_TYPES.SEARCH_ENGINE,
            INFOBOX_TYPES.SUGGESTIONS_QUERY,
            INFOBOX_TYPES.SUGGESTIONS_NAVIGATION,
            INFOBOX_TYPES.HISTORY_NAVIGATION,
            INFOBOX_TYPES.HISTORY_QUERY
        ]);

        let spinner_id = 'suggestions_spinner';
        let spinner_timeout_id = Mainloop.timeout_add(250, Lang.bind(this, function() {
            this._box.show_spinner('Loading suggestions...', spinner_id, 0);
        }));

        suggestions_engine.get_suggestions(term, limit,
            Lang.bind(this, function(suggestions) {
                if(spinner_timeout_id > 0) {
                    Mainloop.source_remove(spinner_timeout_id);
                    this._box.hide_spinner(spinner_id);
                    spinner_timeout_id = 0;
                }

                if(!suggestions || suggestions.length < 1) {
                    return;
                }

                for(let i = 0; i < suggestions.length; i++) {
                    if(suggestions[i].term !== this._entry.get_text()) continue;

                    let menu_item = suggestions_engine.get_menu_item(
                        suggestions[i]
                    );
                    this._box.addMenuItem(menu_item);
                    this._connect_menu_item_signals(menu_item);
                }

                this.emit('suggestions-recieved');
                this._select_first_suggestion(term);
            })
        );
    },

    _get_helpers: function(search_engine, term) {
        this._box.helpers.clear();
        let all_helpers = this._helpers_system.get_helpers();
        let helpers = [];

        if(search_engine.allowed_helpers.length > 0) {
            for(let i = 0; i < all_helpers.length; i++) {
                let helper_name = all_helpers[i].file_name;

                if(search_engine.allowed_helpers.indexOf(helper_name) !== -1) {
                    helpers.push(all_helpers[i]);
                }
            }
        }
        else {
            helpers = false;
        }

        let temp = helpers;

        if(!helpers || helpers.length < 1) {
            this._box.helpers.hide();
            return;
        }

        let spinner_timeout_id = Mainloop.timeout_add(500, Lang.bind(this, function() {
            this._box.open();
            this._box.helpers.show();
            this._box.helpers.show_spinner();
        }));

        for(let i = 0; i < helpers.length; i++) {
            let helper = helpers[i];

            if(!helper.is_valid_query(term)) {
                temp.splice(temp.indexOf(helper), 1);
                continue;
            }

            helper.get_info(term, Lang.bind(this, function(helper_data) {
                temp.splice(temp.indexOf(helper), 1);

                if(helper_data !== false) {
                    let helper_box = helper.get_helper_box(helper_data);
                    this._box.helpers.add_helper(helper_box);
                }

                if(temp.length === 0) {
                    this.emit('helpers-recieved');

                    if(spinner_timeout_id > 0) {
                        Mainloop.source_remove(spinner_timeout_id);
                        this._box.helpers.hide_spinner();
                        spinner_timeout_id = 0;
                    }
                }
            }));
        }
    },

    show_suggestions: function(search_engine, term) {
        if(Utils.is_blank(term)) {
            if(this._box.helpers.is_empty()) this.close();
            return;
        }

        if(this.show_suggestions_trigger && search_engine.enable_suggestions) {
            if(term.slice(-1) == ' ') return;

            if(this._box.is_open() && !this._box.is_empty()) {
                let item = this._box.firstMenuItem;

                if(SUGGESTIONS_TYPES.indexOf(item.type) === -1) {
                    item = null;
                    let items = this._box._getMenuItems();

                    for(let i = 0; i < items.length; i++) {
                        if(SUGGESTIONS_TYPES.indexOf(items[i].type) != -1) {
                            item = items[i];
                            break;
                        }
                    }
                }

                if(item === null) return;

                let current_term = term.toUpperCase();
                let suggestion_text =
                    item.text.slice(0, current_term.length).toUpperCase();

                if(suggestion_text == current_term) {
                    this._highlight_suggestions(current_term);
                    return;
                }
            }

            this._remove_timeout_ids(TIMEOUT_NAMES.SUGGESTIONS);
            this._timeout_ids[TIMEOUT_NAMES.SUGGESTIONS] = Mainloop.timeout_add(
                this._settings.get_int(Prefs.SUGGESTIONS_DELAY_KEY),
                Lang.bind(this, function() {
                    let suggestions_engine;

                    if(search_engine.suggestions_engine === 'default') {
                        suggestions_engine =
                            this._suggestions_system.get_default_engine();
                    }
                    else {
                        suggestions_engine =
                            this._suggestions_system.get_engine_by_property(
                                search_engine.suggestions_engine,
                                'file_name'
                            );
                        suggestions_engine = !suggestions_engine
                            ? this._suggestions_system.get_default_engine()
                            : suggestions_engine
                    }

                    let limit = this._settings.get_int(Prefs.MAX_SUGGESTIONS);
                    this._get_suggestions(suggestions_engine, term, limit);
                })
            )
        }
        else {
            this.show_suggestions_trigger = true;
        }
    },

    show_helpers: function(search_engine, term) {
        if(Utils.is_blank(term)) {
            this._box.helpers.hide();

            if(this._box.helpers.is_empty() && this._box.numMenuItems < 2) {
                this.close();
            }

            return;
        }

        if(this.show_helpers_trigger && search_engine.enable_helpers) {
            this._remove_timeout_ids(TIMEOUT_NAMES.HELPERS);
            this._timeout_ids[TIMEOUT_NAMES.HELPERS] = Mainloop.timeout_add(
                this._settings.get_int(Prefs.HELPER_DELAY_KEY),
                Lang.bind(this, function() {
                    this._get_helpers(search_engine, term);
                })
            )
        }
        else {
            this.show_helpers_trigger = true;
        }
    },

    update_helpers_position: function() {
        if(this._box.helpers.is_empty() || !this._box.helpers.is_open()) return;

        let choosed_position = this._settings.get_int(
            Prefs.HELPER_POSITION_KEY
        );
        let position = 0;

        if(choosed_position === HELPER_POSITIONS.BOTTOM) {
            let items = this._box._getMenuItems();

            for(let i = 0; i < items.length; i++) {
                if(items[i].type != INFOBOX_TYPES.HELPER) position++;
            }
        }

        this._box.remove_menu_item(this._box.helpers_menu_item);
        this._box.addMenuItem(this._box.helpers_menu_item, position);
    },

    grab_focus: function() {
        let item = this._box.firstMenuItem;

        if(
            SUGGESTIONS_TYPES.indexOf(item.type) === -1 &&
            item.type != INFOBOX_TYPES.SEARCH_ENGINE
        ) {
            item = null;
            let items = this._box._getMenuItems();

            for(let i = 0; i < items.length; i++) {
                let has_class = items[i].actor.has_style_pseudo_class('active')

                if(SUGGESTIONS_TYPES.indexOf(items[i].type) != -1 && !has_class) {
                    item = items[i];
                    break;
                }
            }
        }

        item.setActive(true);
    },

    show_history_suggestions: function(term) {
        let suggestions_engine = this._suggestions_system.get_engine_by_property(
            'HistorySuggestions',
            'name'
        );
        let limit = this._settings.get_int(Prefs.MAX_HISTORY_SUGGESTIONS);
        this._get_suggestions(suggestions_engine, term, limit);
    },

    show_engines_list: function(exclude_engine) {
        this._remove_timeout_ids();

        this._box.removeAll();
        let search_engines = new SearchEngines.SearchEngines();
        let engines = search_engines.get_engines();

        for(let i = 0; i < engines.length; i++) {
            let engine = engines[i];
            // let default_engine = search_engines.get_default_engine();

            if(exclude_engine && exclude_engine.keyword == engine.keyword) {
                continue;
            }
            else {
                let menu_item = new EngineMenuItem(engine.name, engine.keyword);
                this._box.addMenuItem(menu_item);
                this._connect_menu_item_signals(menu_item);
            }
        }
    },

    display: function(term, search_engine, params) {
        params = Params.parse(params, {
            suggestions: false,
            helpers: false,
            history_suggestions: false,
            engines: false
        });

        if(params.suggestions) {
            this.show_suggestions(search_engine, term);
        }

        if(params.engines) {
            this.show_engines_list(search_engine);
        }

        if(params.history_suggestions) {
            this.show_history_suggestions(term);
        }

        if(params.helpers) {
            this.show_helpers(search_engine, term);
        }
    },

    close: function() {
        this._remove_timeout_ids();
        this._box.close();
    }
});
Signals.addSignalMethods(InfoboxManager.prototype);