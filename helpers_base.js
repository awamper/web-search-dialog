const St = imports.gi.St;
const Lang = imports.lang;
const Params = imports.misc.params;
const Tweener = imports.ui.tweener;
const Soup = imports.gi.Soup;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;

const _httpSession = Utils._httpSession;

const HelperBase = new Lang.Class({
    Name: 'HelperBase',

    _init: function(name, url) {
        this.name = name;
        this._url = url;
    },

    _make_url: function(term) {
        if(Utils.is_blank(this._url) || this._url.indexOf('{term}') === -1) {
            throw new Error('Invalid helper url.');
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

    parse_response: function(helper_source_data) {
        throw new Error('Not implemented');
    },

    is_valid_query: function(query) {
        return true;
    },

    get_helper_box: function(helper_data) {
        throw new Error('Not implemented');
    },

    get_info: function(term, callback) {
        if(Utils.is_blank(term)) {
            callback(false);
            return;
        }

        let url = this._make_url(term);
        this._get_data_async(url, Lang.bind(this, function(result) {
            let helper_data = this.parse_response(result);

            if(helper_data != false) {
                helper_data.term = term;
            }

            callback(helper_data);
        }));
    }
});

const HelperBoxBase = new Lang.Class({
    Name: 'HelperBoxBase',

    _init: function(helper_data) {
        this.make_actor(helper_data);
    },

    _get_label: function(data) {
        data = Params.parse(data, {
            text: false,
            class_name: 'helper-text',
            max_length: 110
        });

        if(!data.text) {
            return false;
        }

        let text = Utils.wordwrap(
            data.text.trim(),
            data.max_length
        );

        let label = new St.Label({
            text: text,
            style_class: data.class_name
        });
        label.clutter_text.use_markup = true;
        label.clutter_text.line_wrap = true;

        return label;
    },

    make_actor: function(helper_data) {
        this.actor = new St.BoxLayout();

        let table = new St.Table({
            name: 'helper_table'
        });
        let max_length = 80;
        let icon = this.get_icon(helper_data.icon_info);

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

        let label = this._get_label({
            text: helper_data.text,
            max_length: max_length
        });
        table.add(label, {
            row: 0,
            col: 0
        });

        this.actor.add(table);
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
            style_class: 'helper-icon-box',
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