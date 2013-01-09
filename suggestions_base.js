const Lang = imports.lang;
const St = imports.gi.St;
const Clutter = imports.gi.Clutter;
const PopupMenu = imports.ui.popupMenu;
const Soup = imports.gi.Soup;
const Params = imports.misc.params;
const Tweener = imports.ui.tweener;
const Me = imports.misc.extensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;
const infobox = Me.imports.infobox;

const _httpSession = Utils._httpSession;
const ICONS = Utils.ICONS;

const SuggestionsBase = new Lang.Class({
    Name: 'SuggestionsBase',

    _init: function(name, url) {
        this.name = name;
        this._url = url;
    },

    _make_url: function(term) {
        if(Utils.is_blank(this._url) || this._url.indexOf('{term}') === -1) {
            throw new Error('Invalid suggestions engine url.');
            return false;
        }

        let result = false;

        if(!Utils.is_blank(term)) {
            result = this._url.replace('{term}', encodeURIComponent(term));
        }

        return result;
    },

    _get_data_async: function(url, callback) {
        let request = Soup.Message.new('GET', url);

        _httpSession.queue_message(request, Lang.bind(this,
            function(_httpSession, message) {
                if(message.status_code === 200) {
                    try {
                        callback(request.response_body.data);
                    }
                    catch(e) {
                        log('Error: '+e);
                        callback('');
                    }
                }
                else {
                    callback('');
                }
            }
        ));
    },

    parse_suggestions: function(suggestions, term) {
        throw new Error('Not implemented');
    },

    get_menu_item: function(suggestion_data) {
        throw new Error('Not implemented');
    },

    get_suggestions: function(term, limit, callback) {
        if(Utils.is_blank(term)) {
            callback([]);
            return;
        }

        let url = this._make_url(term);
        this._get_data_async(url, Lang.bind(this, function(result) {
            let suggestions = this.parse_suggestions(result, term);
            limit = parseInt(limit, 10);

            if(limit < 1) {
                limit = suggestions.length;
            }

            callback(suggestions.slice(0, limit));
        }));
    }
});

const SuggestionMenuItemBase = new Lang.Class({
    Name: 'SuggestionMenuItemBase',
    Extends: PopupMenu.PopupBaseMenuItem,

    _init: function(suggestion_data, params) {
        this.parent(params);

        this.make_actor(suggestion_data);
    },

    _onKeyPressEvent: function (actor, event) {
        let symbol = event.get_key_symbol();

        if(symbol == Clutter.KEY_Return) {
            this.activate(event);
            return true;
        }

        return false;
    },

    make_actor: function(suggestion_data) {
        this.text = suggestion_data.text.trim();
        this.type = suggestion_data.type;
        this.relevance = suggestion_data.relevance;
        this.term = suggestion_data.term.trim();

        let highlighted_text = this.highlight_text(this.term);

        this.label = new St.Label({
            style_class: 'suggestions-text',
            text: highlighted_text
        });
        this.label.clutter_text.use_markup = true;

        this.icon = new St.Icon({
            style_class: 'menu-item-icon'
        });

        if(this.type === infobox.INFOBOX_TYPES.SUGGESTIONS_NAVIGATION) {
            this.icon.icon_name = ICONS.web;
        }
        else if(this.type === infobox.INFOBOX_TYPES.HISTORY_NAVIGATION) {
            this.icon.icon_name = ICONS.web;
        }
        else {
            this.icon.icon_name = ICONS.find;
        }

        this._box = new St.BoxLayout();
        this._box.add(this.icon);
        this._box.add(this.label);

        this.addActor(this._box);
        this.actor.label_actor = this.label;
    },

    highlight_text: function(term) {
        let highlighted_text = Utils.escape_html(this.text).replace(
            new RegExp(
                '(.*?)('+Utils.escape_html(term)+')(.*?)',
                "i"
            ),
            "$1<b>$2</b>$3"
        );

        return highlighted_text;
    },

    get_icon: function(icon_info) {
        let info = Params.parse(icon_info, {
            url: false,
            width: 120,
            height: 100
        });

        if(!info.url) {
            return false;
        }

        let textureCache = St.TextureCache.get_default();
        let icon = textureCache.load_uri_async(
            info.url,
            info.width,
            info.height
        );

        let icon_box = new St.BoxLayout({
            style_class: 'suggestions-icon-box',
            width: info.width,
            height: info.height,
            opacity: 0
        });

        icon_box.add(icon);
        icon_box.connect('notify::allocation', Lang.bind(this, function() {
            let natural_width = icon_box.get_preferred_width(-1)[1];

            if(natural_width > 10) {
                Tweener.addTween(icon_box, {
                    transition: 'easeOutQuad',
                    time: 1,
                    opacity: 255
                });
            }
        }));

        return icon_box;
    }
});