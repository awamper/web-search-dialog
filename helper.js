const St = imports.gi.St;
const Lang = imports.lang;
const PopupMenu = imports.ui.popupMenu;
const Params = imports.misc.params;
const Tweener = imports.ui.tweener;
const Soup = imports.gi.Soup;
const Gio = imports.gi.Gio;
const Clutter = imports.gi.Clutter;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;
const Prefs = Me.imports.prefs;


const DUCKDUCKGO_API_URL =
    "https://api.duckduckgo.com/?format=json&no_redirect=1"+
    "&skip_disambig=1&q=";

var HelperSpinnerMenuItem = class HelperSpinnerMenuItem extends PopupMenu.PopupBaseMenuItem {
    constructor(text) {
        super({
            reactive: false,
            activate: false,
            hover: false,
            can_focus: false
        });
        this._type = 'HELPER';

        let label = new St.Label({
            text: Utils.is_blank(text) ? 'Checking helper...' : text
        });

        let box = new St.BoxLayout({
            style_class: 'helper-title'
        });
        box.add(label);

        this.actor.add_child(box);
    }
}

var DuckDuckGoHelperMenuItem = class DuckDuckGoHelperMenuItem extends PopupMenu.PopupBaseMenuItem {
    constructor(data) {
        super({
            reactive: false,
            activate: false,
            hover: false,
            can_focus: false
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

        let grid_layout = new Clutter.GridLayout();
        let grid = new St.Widget({
            name: 'helper_table',
            style_class: 'helper-box',
            layout_manager: grid_layout,
            visible: true
        });

        let max_length = 80;

        if(icon) {
            grid_layout.attach(icon, 0, 0, 1, 1);
        }
        else {
            max_length = 110;
        }

        let text = '';
        if(data.definition) {text += '<i>'+data.definition.trim()+'</i>\n';}
        if(data.abstract) {text += data.abstract.trim();}
        let label = this._get_label(text, 'helper-abstract', max_length);

        grid_layout.attach(label, 1, 0, 1, 1);
        this.actor.add_child(grid);

        return true;
    }

    _get_icon(icon_info) {
        let info = Params.parse(icon_info, {
            url: false,
            width: 120,
            height: 100
        });

        if(!info.url) {
            return false;
        }

        let scale_factor = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        let textureCache = St.TextureCache.get_default();
        let image_file = Gio.file_new_for_uri(info.url);
        let icon = textureCache.load_file_async(
            image_file,
            info.width,
            info.height,
            scale_factor
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
    }

    _get_label(text, class_name, max_length) {
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
};

var DuckDuckGoHelper = class DuckDuckGoHelper {
    constructor() {
        this._settings = Utils.getSettings();
        this._http_session = this._create_session();
    }

    _create_session() {
        let http_session = new Soup.Session({
            user_agent: Utils.DEFAULT_USER_AGENT,
            timeout: 5,
            accept_language: 'en'
        });
        Soup.Session.prototype.add_feature.call(
            http_session,
            new Soup.ProxyResolverDefault()
        );

        return http_session;
    }

    _get_data_async(url, callback) {
        let request = Soup.Message.new('GET', url);

        this._http_session.accept_language = this._settings.get_string(Prefs.LANGUAGE_CODE);
        this._http_session.queue_message(request,
            Lang.bind(this, function(http_session, message) {
                if(message.status_code === 200) {
                    callback.call(this, request.response_body.data);
                }
                else {
                    callback.call(this, false);
                }
            })
        );
    }

    _parse_response(response) {
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
    }

    get_info(query, callback) {
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
    }

    get_menu_item(data) {
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
};
