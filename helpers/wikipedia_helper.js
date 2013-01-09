const St = imports.gi.St;
const Lang = imports.lang;
const Params = imports.misc.params;

const Extension = imports.misc.extensionUtils.get_web_search_dialog_extension();
const HelpersBase = Extension.imports.helpers_base;
const Utils = Extension.imports.utils;

const NAME = 'Wikipedia.org';
const URL =
    "https://en.wikipedia.org/w/api.php?action=opensearch"+
    "&format=xml&limit=1&search={term}";

const HelperBox = new Lang.Class({
    Name: 'WikipediaHelperBox',
    Extends: HelpersBase.HelperBoxBase,

    _init: function(name, helper_data) {
        this.name = name;
        this.parent(helper_data);
    },
});

const Helper = new Lang.Class({
    Name: 'WikipediaHelper',
    Extends: HelpersBase.HelperBase,

    _init: function() {
        this.parent(NAME, URL);
    },

    _get_image: function(source) {
        let regexpr = /<Image source="(.+?)" width="([0-9]+?)" height="([0-9]+?)" \/>/;
        let matches = regexpr.exec(source);

        if(matches == null) return false;

        if(!Utils.is_blank(matches[1])) {
            let result = {};
            result.url = matches[1].trim();

            if(!Utils.is_blank(matches[2])) {
                result.width = matches[2];
            }
            if(!Utils.is_blank(matches[3])) {
                result.height = matches[3];
            }

            return result;
        }
        else {
            return false;
        }
    },

    _get_title: function(source) {
        let regexpr = /<Text.*?>(.*?)<\/Text>/;
        let matches = regexpr.exec(source);

        if(matches == null) return false;

        if(!Utils.is_blank(matches[1])) {
            return matches[1].trim();
        }
        else {
            return false;
        }
    },

    _get_description: function(source) {
        let regexpr = /<Description.*?>(.*?)<\/Description>/;
        let matches = regexpr.exec(source);

        if(matches == null) return false;

        if(!Utils.is_blank(matches[1])) {
            return matches[1].trim();
        }
        else {
            return false;
        }
    },

    parse_response: function(helper_source_data) {
        if(Utils.is_blank(helper_source_data)) return false;

        // let title = this._get_title(helper_source_data);
        let description = this._get_description(helper_source_data);

        let result = {};

        if(!Utils.is_blank(description)) {
            result.text = description;
            result.icon_info = this._get_image(helper_source_data)
        }
        else {
            result = false;
        }

        return result;
    },

    get_helper_box: function(helper_data) {
        let box = new HelperBox(this.name, helper_data);
        return box;
    }
});