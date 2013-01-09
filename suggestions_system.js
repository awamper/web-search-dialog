const Lang = imports.lang;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;
const Prefs = Me.imports.prefs_keys;

const SuggestionsSystem = new Lang.Class({
    Name: 'SuggestionsSystem',

    _init: function() {
        this._settings = Utils.getSettings();
        this._suggestion_engines = this._load_engines();
    },

    _load_engines: function() {
        let suggestions_engines = [];
        let suggestions_imports = Me.imports.suggestions;
        let files_list = Utils.get_files_in_dir(Me.path+'/suggestions')

        for(let i = 0; i < files_list.length; i++) {
            let file_name = files_list[i];
            let module_name = file_name.slice(0, -3);

            if(!Utils.ends_with(file_name, '_suggestions.js')) continue;

            let engine = new suggestions_imports[module_name].Suggestions();
            engine.file_name = file_name;
            suggestions_engines.push(engine);
        }

        return suggestions_engines;
    },

    get_engines: function() {
        return this._suggestions_engines.slice();
    },

    get_default_engine: function() {
        let file_name = this._settings.get_string(Prefs.DEFAULT_SUGGESTIONS_KEY);
        let engine = this.get_engine_by_property(file_name, 'file_name');
        return engine;
    },

    get_engine_by_property: function(value, property) {
        let result = false;

        if(Utils.is_blank(property) || Utils.is_blank(value)) return result;

        for(let i = 0; i < this._suggestion_engines.length; i++) {
            let engine = this._suggestion_engines[i];

            if(engine[property] !== undefined && engine[property] === value) {
                result = engine;
                break;
            }
        }

        return result;
    },

    get_engine_by_name: function(name) {
        return this.get_engine_by_property(name, 'name');
    }
});
