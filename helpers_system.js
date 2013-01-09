const Lang = imports.lang;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;

const HelpersSystem = new Lang.Class({
    Name: 'HelpersSystem',

    _init: function() {
        this._helpers = this._load_helpers();
    },

    _load_helpers: function() {
        let helpers = [];
        let helpers_imports = Me.imports.helpers;
        let files_list = Utils.get_files_in_dir(Me.path+'/helpers')

        for(let i = 0; i < files_list.length; i++) {
            let file_name = files_list[i];
            let module_name = file_name.slice(0, -3);

            if(!Utils.ends_with(file_name, '_helper.js')) continue;

            let helper = new helpers_imports[module_name].Helper();
            helper.file_name = file_name;
            helpers.push(helper);
        }

        return helpers;
    },

    get_by_name: function(name) {
        let result = false;
        name = name.trim();

        if(Utils.is_blank(name)) return result;

        for(let i = 0; i < this._helpers.length; i++) {
            let helper = this._helpers[i];

            if(helper.name == name) {
                result = helper;
                break;
            }
        }

        return result;
    },

    get_helpers: function() {
        if(this._helpers.length > 0) {
            return this._helpers.slice();
        }
        else {
            return false;
        }
    },
});