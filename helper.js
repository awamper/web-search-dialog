const St = imports.gi.St;
const Lang = imports.lang;
const PopupMenu = imports.ui.popupMenu;
const Panel = imports.ui.panel;
const Params = imports.misc.params;
const Tweener = imports.ui.tweener;
const Soup = imports.gi.Soup;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;

const _httpSession = Utils._httpSession;

const DUCKDUCKGO_API_URL = 
    "https://api.duckduckgo.com/?format=json&no_redirect=1"+
    "&skip_disambig=1&q=";

const HelperSpinnerMenuItem = Lang.Class({
    Name: 'HelperSpinnerMenuItem',
    Extends: PopupMenu.PopupBaseMenuItem,

    _init: function(text) {
        this.parent({
            reactive: false,
            activate: false,
            hover: false,
            sensitive: false
        });
        this._type = 'HELPER';

        let spinner = new Panel.AnimatedIcon(
            'process-working.svg',
            24
        );
        spinner.actor.show();

        let label = new St.Label({
            text: Utils.is_blank(text) ? 'Checking helper...' : text
        });

        let box = new St.BoxLayout({
            style_class: 'helper-title'
        });
        box.add(spinner.actor);
        box.add(label);

        this.addActor(box);
    }
});

const DuckDuckGoHelperMenuItem = new Lang.Class({
    Name: 'DuckDuckGoHelperMenuItem',
    Extends: PopupMenu.PopupBaseMenuItem,

    _init: function(data) {
        this.parent({
            reactive: false,
            activate: false,
            hover: false,
            sensitive: false
        });
        this._type = 'HELPER';

        data = Params.parse(data, {
            heading: '',
            definition: '',
            abstract: '',
            icon: ''
        });

        if(Utils.is_blank(data.abstract) && Utils.is_blank(data.definition)) {
            return false;
        }

        let icon = this._get_icon(data.icon);
        let table = new St.Table({
            name: 'helper_table',
            style_class: 'helper-box'
        });
        let max_length = 80;

        if(icon) {
            table.add(icon, {
                row: 0,
                col: 1,
                x_fill: false,
                y_fill: false
            });
        }
        else {
            max_length = 110;
        }

        let text = '';
        if(data.definition) {text += '<i>'+data.definition.trim()+'</i>\n';}
        if(data.abstract) {text += data.abstract.trim();}
        let label = this._get_label(text, 'helper-abstract', max_length);
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

    _get_label: function(text, class_name, max_length) {
        if(Utils.is_blank(text)) {
            return false;
        }

        text = Utils.wordwrap(text.trim(), max_length);

        let label = new St.Label({
            text: text,
            style_class: class_name
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
            heading: Utils.is_blank(response.Heading)
                ? false
                : response.Heading.trim().replace(/<[^>]+>/g, ""),
            abstract: Utils.is_blank(response.Abstract)
                ? false
                : response.AbstractText.trim().replace(/<[^>]+>/g, ""),
            definition: 
                Utils.is_blank(response.Definition) ||
                response.Definition == response.Abstract
                ? false
                : response.Definition.trim().replace(/<[^>]+>/g, ""),
            image: Utils.is_blank(response.Image)
                ? false
                : response.Image.trim()
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

    get_menu_item: function(data) {
        data = Params.parse(data, {
            heading: '',
            definition: '',
            abstract: '',
            icon: false
        });

        if(Utils.is_blank(data.abstract) && Utils.is_blank(data.definition)) {
            return false;
        }
        else {
            let menu_item = new DuckDuckGoHelperMenuItem(data);

            return menu_item;
        }
    }
});