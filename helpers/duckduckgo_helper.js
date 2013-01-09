const St = imports.gi.St;
const Lang = imports.lang;
const Params = imports.misc.params;

const Extension = imports.misc.extensionUtils.get_web_search_dialog_extension();
const HelpersBase = Extension.imports.helpers_base;
const Utils = Extension.imports.utils;

const NAME = 'DuckDuckGo.com';
const URL =
    "https://api.duckduckgo.com/?format=json&no_redirect=1&skip_disambig=1&q={term}";

const HelperBox = new Lang.Class({
    Name: 'DuckDuckGoHelperBox',
    Extends: HelpersBase.HelperBoxBase,

    _init: function(name, helper_data) {
        this.name = name;
        this.parent(helper_data);
    },

    make_actor: function(helper_data) {
        let data = Params.parse(helper_data, {
            heading: '',
            definition: '',
            abstract: '',
            icon_info: false,
            term: ''
        });

        if(Utils.is_blank(data.abstract) && Utils.is_blank(data.definition)) {
            return false;
        }

        let icon = this.get_icon(data.icon_info);
        let table = new St.Table({
            name: 'helper_table'
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
        if(data.definition) {
            text += '<i>'+Utils.escape_html(data.definition.trim())+'</i>\n';
        }
        if(data.abstract) {
            text += Utils.escape_html(data.abstract.trim());
        }
        let label = this._get_label({
            text: text,
            max_length: max_length
        });
        table.add(label, {
            row: 0,
            col: 0
        });

        this.actor = new St.BoxLayout();
        this.actor.add(table);

        return this.actor;
    }
});

const Helper = new Lang.Class({
    Name: 'DuckDuckGoHelper',
    Extends: HelpersBase.HelperBase,

    _init: function() {
        this.parent(NAME, URL);
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

        let result = {
            heading: Utils.is_blank(parsed_json.Heading)
                ? false
                : parsed_json.Heading.trim().replace(/<[^>]+>/g, ""),
            abstract: Utils.is_blank(parsed_json.Abstract)
                ? false
                : parsed_json.AbstractText.trim().replace(/<[^>]+>/g, ""),
            definition: 
                Utils.is_blank(parsed_json.Definition) ||
                parsed_json.Definition == parsed_json.Abstract
                ? false
                : parsed_json.Definition.trim().replace(/<[^>]+>/g, ""),
            icon_info: Utils.is_blank(parsed_json.Image)
                ? false
                : {url: parsed_json.Image.trim()}
        };

        return !result.abstract && !result.definition ? false : result;
    },

    get_helper_box: function(helper_data) {
        let box = new HelperBox(this.name, helper_data);
        return box;
    }
});