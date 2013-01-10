const St = imports.gi.St;
const Lang = imports.lang;

const Extension = imports.misc.extensionUtils.get_web_search_dialog_extension();
const HelpersBase = Extension.imports.helpers_base;
const Utils = Extension.imports.utils;

const NAME = 'FreebaseHelper';
const URL = 'https://www.googleapis.com/freebase/v1/search?&limit=1&query={term}';

const HelperBox = new Lang.Class({
    Name: 'FreebaseHelperBox',
    Extends: HelpersBase.HelperBoxBase,

    _init: function(name, helper_data) {
        this.name = name;
        this.parent(helper_data);
    },

    make_actor: function(helper_data) {
        this.actor = new St.BoxLayout();

        let table = new St.Table({
            name: 'helper_table'
        });

        let icon = this.get_icon(helper_data.icon_info);

        if(icon) {
            table.add(icon, {
                row: 0,
                col: 0,
                x_fill: false,
                y_fill: false
            });
        }

        let label = new St.Label({
            text: Utils.wordwrap(Utils.escape_html(helper_data.text, 80)),
            style_class: 'helper-text'
        });
        label.clutter_text.use_markup = true;

        let box = new St.BoxLayout({
            vertical: true
        });
        box.add(label, {
            x_fill: true,
            y_fill: true,
            x_align: St.Align.END,
            y_align: St.Align.START
        });
        let scroll = new St.ScrollView({
            height: 150
        });
        scroll.add_actor(box);

        table.add(scroll, {
            row: 0,
            col: 1,
        });

        this.actor.add(table);
    },
});

const Helper = new Lang.Class({
    Name: 'FreebaseHelper',
    Extends: HelpersBase.HelperBase,

    _init: function() {
        this.parent(NAME, URL);
    },

    _get_text: function(id, callback) {
        let url = 'https://www.googleapis.com/freebase/v1/text/{id}?format=plain';
        url = url.replace('{id}', id);

        this._get_data_async(url, Lang.bind(this, function(source_result) {
            try {
                source_result = JSON.parse(source_result);

                if(source_result.result.length > 0) {
                    callback(source_result.result);
                }
                else {
                    callback('');
                }
            }
            catch(e) {
                log('FreebaseHelper error: '+e);
                callback('');
            }
        }));
    },

    _make_icon_url: function(id, max_width, max_height) {
        let url =
            'https://usercontent.googleapis.com/freebase/v1/image{id}'+
            '?pad=true&mode=fillcropmid&maxwidth='+max_width+'&maxheight='+max_height;
        url = url.replace('{id}', id);
        return url;
    },

    get_info: function(term, callback) {
        if(Utils.is_blank(term)) {
            callback(false);
            return;
        }

        let url = this._make_url(term);
        this._get_data_async(url, Lang.bind(this, function(result) {
            let id = this.parse_response(result);
            let helper_data = {};

            if(helper_data != false) {
                helper_data.id = id;
                helper_data.term = term;

                this._get_text(helper_data.id, Lang.bind(this, function(result) {
                    if(result.length > 0) {
                        helper_data.text = result;
                        helper_data.icon_info = {
                            url: this._make_icon_url(helper_data.id, 120, 120),
                            width: 120,
                            height: 120
                        };
                        callback(helper_data);
                    }
                    else {
                        callback(false);
                    }
                }));
            }
        }));
    },

    parse_response: function(helper_source_data) {
        if(Utils.is_blank(helper_source_data)) return false;

        let parsed_json;

        try {
            parsed_json = JSON.parse(helper_source_data);
        }
        catch(e) {
            log("Can't parse helper source. "+e);
            return false;
        }

        if(parsed_json.result.length > 0) {
            let id = parsed_json.result[0].id;
            return id;
        }
        else {
            return false;
        }
    },

    get_helper_box: function(helper_data) {
        let box = new HelperBox(this.name, helper_data);
        return box;
    }
});