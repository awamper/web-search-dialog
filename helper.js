const St = imports.gi.St;
const Lang = imports.lang;
const PopupMenu = imports.ui.popupMenu;
const Params = imports.misc.params;
const Tweener = imports.ui.tweener;
const Soup = imports.gi.Soup;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;

const _httpSession = Utils._httpSession;

const DUCKDUCKGO_API_URL = 
    "https://api.duckduckgo.com/?format=json&no_redirect=1"+
    "&skip_disambig=1&q=";

const DuckDuckGoHelperMenuItem = new Lang.Class({
    Name: 'DuckDuckGoHelperMenuItem',
    Extends: PopupMenu.PopupBaseMenuItem,

    _init: function(data) {
        this.parent({
            reactive: false,
            activate: false,
            hover: false,
            sensitive: false,
            can_focus: false
        });
        this._type = 'HELPER';

        data = Params.parse(data, {
            text: '',
            icon: ''
        });

        if(Utils.is_blank(data.text)) {
            return false;
        }

        let label = this._get_label(data.text);
        let icon = this._get_icon(data.icon);
        let table = new St.Table({
            name: 'helper_table',
            style_class: 'helper-box'
        });

        if(icon) {
            table.add(icon, {
                row: 0,
                col: 1,
                x_fill: false,
                y_fill: false
            });
        }

        table.add(label, {
            row: 0,
            col: 0
        });

        this.addActor(table);

        return true;
    },

    _get_icon: function(icon_info) {
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

        this.icon_box = new St.BoxLayout({
            style_class: 'helper-icon-box',
            opacity: 0
        });

        this.icon_box.add(icon);
        this.icon_box.connect('notify::allocation', Lang.bind(this, function() {
            let natural_width = this.icon_box.get_preferred_width(-1)[1];

            if(natural_width > 10) {
                Tweener.addTween(this.icon_box, {
                    transition: 'easeOutQuad',
                    time: 1,
                    opacity: 255
                });
            }
        }));

        return this.icon_box;
    },

    _get_label: function(text) {
        if(Utils.is_blank(text)) {
            return false;
        }

        text = Utils.wordwrap(text.trim(), 70);

        let label = new St.Label({
            text: text,
            style_class: 'helper-text'
        });
        label.clutter_text.use_markup = true;
        label.clutter_text.line_wrap = true;

        return label;
    }
});

const DuckDuckGoHelper = new Lang.Class({
    Name: 'DuckDuckGoHelper',

    _init: function() {
        // nothing
    },

    _get_data_async: function(url, callback) {
        let request = Soup.Message.new('GET', url);

        _httpSession.queue_message(request,
            Lang.bind(this, function(_httpSession, message) {
                if(message.status_code === 200) {
                    callback.call(this, request.response_body.data);
                }
                else {
                    callback.call(this, false);
                }
            })
        );
    },

    _parse_response: function(response) {
        response = JSON.parse(response);

        let result = {
            abstract: Utils.is_blank(response.Abstract)
                ? false
                : response.Abstract,
            image: Utils.is_blank(response.Image)
                ? false
                : response.Image
        };

        return result;
    },

    get_info: function(query, callback) {
        query = query.trim();

        if(Utils.is_blank(query)) {
            return false;
        }

        let url = DUCKDUCKGO_API_URL+encodeURIComponent(query);
        this._get_data_async(url, Lang.bind(this, function(result) {
            if(!result) {
                callback.call(this, false);
            }

            let info = this._parse_response(result);
            callback.call(this, info);
        }));

        return true;
    },

    get_menu_item: function(text, icon_info) {
        let menu_item = new DuckDuckGoHelperMenuItem({
            text: text,
            icon: icon_info
        });

        return menu_item;
    }
});