const St = imports.gi.St;
const Lang = imports.lang;
const Main = imports.ui.main;
const Clutter = imports.gi.Clutter;
const PopupMenu = imports.ui.popupMenu;
const Params = imports.misc.params;
const Soup = imports.gi.Soup;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;

const ICONS = Utils.ICONS;

const SuggestionMenuItem = new Lang.Class({
    Name: 'SuggestionMenuItem',
    Extends: PopupMenu.PopupBaseMenuItem,

    _init: function(text, type, relevance, term, item_id, params) {
        this.parent(params);

        this._text = text.trim();
        this._type = type;
        this._relevance = relevance;
        this._term = term.trim();
        this._item_id = item_id;

        let highlight_text = Utils.escape_html(this._text).replace(
            new RegExp(
                '(.*?)('+Utils.escape_html(this._term)+')(.*?)',
                "i"
            ),
            "$1<b>$2</b>$3"
        );

        let id_label = false;

        if(this._item_id > 0 && this._item_id <= 9) {
            id_label = new St.Label({
                text: '^'+this._item_id.toString(),
                style_class: 'item-id-label'
            });
        }

        let label = new St.Label({
            text: highlight_text
        });
        label.clutter_text.use_markup = true;

        let icon = new St.Icon({
                style_class: 'menu-item-icon'
        });

        if(this._type == 'NAVIGATION') {
            icon.icon_name = ICONS.web;
        }
        else {
            icon.icon_name = ICONS.find;
        }

        this._box = new St.BoxLayout();

        if(id_label) {
            this._box.add(id_label);
        }

        this._box.add(icon);
        this._box.add(label);

        this.actor.add_child(this._box);
        this.actor.label_actor = label;
    },

    _onKeyPressEvent: function(actor, event) {
        let symbol = event.get_key_symbol();

        if(symbol == Clutter.Return || symbol == Clutter.KP_Enter) {
            this.activate(event);
            return true;
        }
        else {
            return false;
        }
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
        this.actor.connect('key-press-event', Lang.bind(this, this._onKeyPressEvent));
    },

    _onKeyPressEvent: function(actor, event) {
        let symbol = event.get_key_symbol();

        if(symbol == Clutter.Escape) {
            this.close(true);
        }
        else if(symbol == Clutter.BackSpace) {
            this._entry.grab_key_focus();
            this._search_dialog.show_suggestions = false;
            this._entry.set_text(this._entry.get_text().slice(0, -1));
        }
        else {
            let skip_keys = (
                symbol == Clutter.Up ||
                symbol == Clutter.Down ||
                symbol == Clutter.Tab
            );

            if(!skip_keys) {
                let ch = this._get_unichar(symbol);
                this._entry.grab_key_focus();

                if(ch) {
                    this._entry.set_text(this._entry.get_text() + ch);
                }
            }
        }
    },

    _get_unichar: function(keyval) {
        let ch = Clutter.keysym_to_unicode(keyval);

        if(ch) {
            return String.fromCharCode(ch);
        }
        else {
            return false;
        }
    },

    _on_activated: function(menu_item) {
        this._search_dialog._remove_delay_id();
        this._search_dialog.suggestions_box.close(true);

        if(menu_item._type == "ENGINE") {
            let engine_keyword = menu_item._term.trim();
            this._search_dialog._set_engine(engine_keyword);
        }
        else {
            let text = menu_item._text.trim();

            if(menu_item._type == 'NAVIGATION') {
                this._search_dialog._open_url(text, true);
            }
            else {
                this._search_dialog._activate_search(text);
            }
        }

        return true;
    },

    _on_active_changed: function(menu_item) {
        if(menu_item._type != 'ENGINE') {
            this._search_dialog.show_suggestions = false;
            this._entry.set_text(menu_item._text);
        }

        return true;
    },

    _get_next_id: function() {
        let items = this._getMenuItems();
        let types = ['NAVIGATION', 'QUERY', 'ENGINE'];
        let count = 1;

        for(let i = 0; i < items.length; i++) {
            if(types.indexOf(items[i]._type) != -1) {
                count++;

                if(count >= 9) {
                    return false;
                }
            }
        }

        return count;
    },

    activate_by_id: function(item_id) {
        if(item_id < 1 || item_id > 9) return;

        let items = this._getMenuItems();

        for(let i = 0; i < items.length; i++) {
            if(items[i]._item_id === item_id) {
                items[i].activate();
                break;
            }
        }

    },

    add_suggestion: function(params) {
        params = Params.parse(params, {
            text: false,
            type: 'QUERY',
            relevance: 0,
            term: ''
        });

        if(!params.text) {
            return false;
        }

        let item = new SuggestionMenuItem(
            params.text,
            params.type,
            params.relevance,
            params.term,
            this._get_next_id()
        );
        item.connect(
            'activate',
            Lang.bind(this, this._on_activated)
        );
        item.connect(
            'active-changed',
            Lang.bind(this, this._on_active_changed)
        );
        this.addMenuItem(item)

        return true;
    },

    add_label: function(text) {
        let item = new PopupMenu.PopupMenuItem(text, {
            reactive: false,
            activate: false,
            hover: false,
            can_focus: false
        });
        item._type = 'LABEL';
        this.addMenuItem(item);
    },

    remove_all_by_types: function(types_array) {
        let children = this._getMenuItems();

        for(let i = 0; i < children.length; i++) {
            let item = children[i];
            
            if(types_array === 'ALL') {
                item.destroy();
            }
            else if(types_array.indexOf(item._type) > -1) {
                item.destroy();
            }
            else {
                continue;
            }
        }
    },

    close: function() {
        this._search_dialog._remove_delay_id();
        this._entry.grab_key_focus();
        this.parent();
    }
});
