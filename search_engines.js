const Lang = imports.lang;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Prefs = Me.imports.prefs_keys;
const Utils = Me.imports.utils;

const SearchEngine = new Lang.Class({
    Name: 'SearchEngine',

    _init: function(engine_data) {
        this._settings = Utils.getSettings();

        if(!this.set_id(engine_data.id)) {
            throw new Error("'"+engine_data.id+"' is invalid engine id.");
            return;
        }
        else if(!this.set_name(engine_data.name)) {
            throw new Error("Engine's name is blank.");
            return;
        }
        else if(!this.set_keyword(engine_data.keyword)) {
            throw new Error("Engine's keyword is blank.");
            return;
        }
        else if(!this.set_url(engine_data.url)) {
            throw new Error("Engine's url is blank.");
            return;
        }
        else {
            this.set_suggestions_engine(engine_data.suggestions_engine);
            this.set_enable_suggestions(engine_data.enable_suggestions);
            this.set_enable_helpers(engine_data.enable_helpers);
            this.set_allowed_helpers(engine_data.allowed_helpers);
        }
    },

    set_id: function(id) {
        if(id === undefined || !/^\d+$/.test(id) || !id > 0) {
            return false;
        }

        this.id = parseInt(id, 10);
        return true;
    },

    set_name: function(name) {
        if(!Utils.is_blank(name)) {
            this.name = name;
            return true;
        }

        return false;
    },

    set_keyword: function(keyword) {
        if(!Utils.is_blank(keyword)) {
            this.keyword = keyword;
            return true;
        }

        return false;
    },

    set_url: function(url) {
        if(!Utils.is_blank(url)) {
            this.url = url;
            return true;
        }

        return false;
    },

    set_suggestions_engine: function(suggestions_engine) {
        if(!Utils.is_blank(suggestions_engine)) {
            this.suggestions_engine = suggestions_engine;
            return true;
        }
        else {
            return false;
        }
    },

    set_enable_suggestions: function(enable) {
        enable = Boolean(enable);
        this.enable_suggestions = enable === true ? true : false;
    },

    set_enable_helpers: function(enable) {
        enable = Boolean(enable);
        this.enable_helpers = enable === true ? true : false;
    },

    set_allowed_helpers: function(file_names_list) {
        if(file_names_list instanceof Array) {
            this.allowed_helpers = file_names_list;
        }
        else {
            this.allowed_helpers = [];
        }
    },

    make_query_url: function(term) {
        return this.url.replace('{term}', term);
    },

    is_default: function() {
        let default_id = this._settings.get_int(Prefs.DEFAULT_ENGINE_KEY);
        return default_id == this.id;
    },

    is_open_url: function() {
        return this._open_url;
    },

    edit: function(new_data) {
        this.set_name(new_data.name);
        this.set_keyword(new_data.keyword);
        this.set_url(new_data.url);
        this.set_suggestions_engine(new_data.suggestions_engine);
        this.set_enable_suggestions(new_data.enable_suggestions);
        this.set_enable_helpers(new_data.enable_helpers);
        this.set_allowed_helpers(new_data.allowed_helpers);
    },

    toString: function() {
        let result =
            '"'+this.id+'": {'+
                '"name": "'+this.name+'",'+
                '"keyword": "'+this.keyword+'",'+
                '"url": "'+this.url+'",'+
                '"suggestions_engine": "'+this.suggestions_engine+'",'+
                '"enable_suggestions": '+this.enable_suggestions+','+
                '"enable_helpers": '+this.enable_helpers+','+
                '"allowed_helpers": '+JSON.stringify(this.allowed_helpers)+
            '}';

        return result;
    }
});

const SearchEngines = new Lang.Class({
    Name: 'SearchEngines',

    _init: function() {
        this._settings = Utils.getSettings();
        this._engines = this._get_engines_list();
        this._current_id = this._settings.get_int(Prefs.DEFAULT_ENGINE_KEY);

        this._settings.connect(
            'changed::'+Prefs.ENGINES_KEY,
            Lang.bind(this, function() {
                this._engines = this._get_engines_list();
            })
        );
    },

    _generate_id: function() {
        let max_id = 1;

        for(let key in this._engines) {
            let key_int = parseInt(key, 10);
            max_id = key_int > max_id ? key_int : max_id;
        }

        return max_id + 1;
    },

    _get_engines_list: function() {
        let result_engines = [];
        let engines = JSON.parse(this._settings.get_string(Prefs.ENGINES_KEY));

        for(let key in engines) {
            let engine;

            try {
                engines[key].id = key;
                engine = new SearchEngine(engines[key]);
            }
            catch(e) {
                log('Can\'t add engine. '+e);
                continue;
            }

            result_engines.push(engine);
        }

        // if(this.get_open_url_keyword()) {
        //     let open_url_engine_data = {
        //         id: 0,
        //         name: this._settings.get_string(Prefs.OPEN_URL_LABEL),
        //         keyword: this._settings.get_string(Prefs.OPEN_URL_KEY),
        //         open_url: true
        //     };
        //     let engine = new SearchEngine(open_url_engine_data);
        //     result_engines.push(engine);
        // }

        return result_engines;
    },

    _save_engines: function() {
        try {
            this._settings.set_string(
                Prefs.ENGINES_KEY,
                this.toJSON()
            );
        }
        catch(e) {
            throw new Error("Error in _save_engines: "+e);
        }
    },

    toJSON: function() {
        let result = '{';

        for(let i = 0; i < this._engines.length; i++) {
            let engine = this._engines[i];
            result += engine.toString();

            if(this._engines.length != i + 1) result += ',';
        }

        result += '}';
        return result;
    },

    edit_engine: function(id, engine_data) {
        let engine = this.get_engine_by_property(id, 'id');

        if(!engine) {
            return false;
        }
        else {
            engine.edit(engine_data);
        }

        this._save_engines();
        return true;
    },

    add_engine: function(engine_data) {
        try {
            engine_data.id = this._generate_id();
            let new_engine = new SearchEngine(engine_data);
            this._engines[engine_data.id] = new_engine;
            this._save_engines();
        }
        catch(e) {
            log("Can't add new engine. Details: "+e);
            return false;
        }

        return true;
    },

    remove_engine: function(id) {
        let index = this.get_index_by_property(id, 'id');

        if(index) {
            this._engines.splice(index, 1);
            this._save_engines();
        }
    },

    get_engines: function() {
        return this._engines.slice();
    },

    get_open_url_keyword: function() {
        let keyword = this._settings.get_string(Prefs.OPEN_URL_KEY);
        return Utils.is_blank(keyword) ? false : keyword.trim();
    },

    get_default_engine: function() {
        let result = false;

        for(let i = 0; i < this._engines.length; i++) {
            let engine = this._engines[i];

            if(engine.is_default()) {
                result = engine;
                break;
            }
        }

        return result;
    },

    is_keyword_exist: function(keyword) {
        for(let i = 0; i < this._engines.length; i++) {
            if(this._engines[i].keyword == keyword) return true;
        }

        return false;
    },

    get current() {
        return this.get_engine_by_property(this._current_id, 'id');
    },

    set_current: function(engine_id) {
        this._current_id = engine_id;
    },

    _get_by_property: function(term, property, return_index) {
        property =
            property === undefined
            ? 'id'
            : property.toString();
        let result = false;

        if(Utils.is_blank(term) || Utils.is_blank(property)) return result;

        if(property === 'id') {
            term = parseInt(term, 10);
        }

        for(let i = 0; i < this._engines.length; i++) {
            let engine = this._engines[i];

            if(engine[property] !== undefined && engine[property] === term) {
                result = return_index ? i : engine;
                break;
            }
        }

        return result;
    },

    get_engine_by_property: function(term, property) {
        return this._get_by_property(term, property, false);
    },

    get_index_by_property: function(term, property) {
        return this._get_by_property(term, property, true);
    }
});
