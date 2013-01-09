const Lang = imports.lang;
const Params = imports.misc.params;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Prefs = Me.imports.prefs_keys;
const Utils = Me.imports.utils;

const SearchHistoryManager = new Lang.Class({
    Name: "SearchHistoryManager",

    _init: function(params) {
        this._settings = Utils.getSettings();

        params = Params.parse(params, {
            gsettings_key: Prefs.HISTORY_KEY,
            limit: this._settings.get_int(Prefs.HISTORY_LIMIT_KEY)
        });

        this._key = params.gsettings_key;
        this._limit = params.limit;

        if(this._key) {
            this._history = JSON.parse(this._settings.get_string(this._key));
            this._settings.connect(
                'changed::'+this._key,
                Lang.bind(this, this._history_changed)
            );
        }
        else {
            this._history = [];
        }

        this._history_index = this._history.length;
    },

    _history_changed: function() {
        this._history = JSON.parse(this._settings.get_string(this._key));
        this._history_index = this._history.length;
    },

    prev_item: function(text) {
        if(this._history_index <= 0) {
            return {query: text};
        }

        this._history_index--;

        return this._index_changed();
    },

    next_item: function(text) {
        if(this._history_index >= this._history.length) {
            return {query: text};
        }

        this._history_index++;

        return this._index_changed();
    },

    last_item: function() {
        if(this._history_index != this._history.length) {
            this._history_index = this._history.length;
            this._index_changed();
        }

        return this._history_index[this._history.length];
    },

    current_index: function() {
        return this._history_index;
    },

    total_items: function() {
        return this._history.length;
    },

    add_item: function(input) {
        if(this._history.length == 0 ||
            this._history[this._history.length - 1].query != input.query ||
            this._history[this._history.length - 1].type != input.type) {

            this._history.push(input);
            this._save();
        }
        this._history_index = this._history.length;
    },

    get_best_matches: function(params) {
        params = Params.parse(params, {
            text: false,
            types: [],
            min_score: 0.5,
            limit: 5,
            fuzziness: 0.5
        });

        if(params.text == false) {
            return false;
        }

        let result = [];
        let history = this._history;

        for(let i = 0; i < history.length; i++) {
            if(params.types.indexOf(history[i].type) == -1) {
                continue;
            }

            let score = Utils.string_score(
                history[i].query,
                params.text,
                params.fuzziness
            );

            if(score >= params.min_score) {
                result.push([score, history[i]]);
            }
        }

        result.sort(function(a, b){return a[0] < b[0]});

        return result.slice(0, params.limit);
    },

    reset_index: function() {
        this._history_index = this._history.length;
    },

    _index_changed: function() {
        let current = this._history[this._history_index] || {
            query: ''
        };

        return current;
    },

    _save: function() {
        if(this._history.length > this._limit) {
            this._history.splice(0, this._history.length - this._limit);
        }

        if(this._key) {
            this._settings.set_string(this._key, JSON.stringify(this._history));
        }
    }
});
