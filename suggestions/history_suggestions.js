const St = imports.gi.St;
const Lang = imports.lang;

const Extension = imports.misc.extensionUtils.get_web_search_dialog_extension();
const SuggestionsBase = Extension.imports.suggestions_base;
const Utils = Extension.imports.utils;
const Infobox = Extension.imports.infobox;
const HistoryManager = Extension.imports.history_manager;

const SUGGESTIONS_NAME = 'HistorySuggestions';

const SuggestionsMenuItem = Lang.Class({
    Name: 'HistorySuggestionsMenuItem',
    Extends: SuggestionsBase.SuggestionMenuItemBase, 

    _init: function(suggestion_data, params) {
        this.parent(suggestion_data, params);
    },

    make_actor: function(suggestion_data) {
        this.parent(suggestion_data);
    },

    highlight_text: function(term) {
        let highlighted_text = Utils.escape_html(this.text).replace(
            new RegExp(
                '(.*?)('+Utils.escape_html(term)+')(.*?)',
                "i"
            ),
            "$1<b>$2</b>$3"
        );
        highlighted_text +=
            '<span size="xx-small" color="grey"><sup>history</sup></span>';
        return highlighted_text;
    }
});

const Suggestions = new Lang.Class({
    Name: 'HistorySuggestions',
    Extends: SuggestionsBase.SuggestionsBase,

    _init: function() {
        this.parent(SUGGESTIONS_NAME, '');
    },

    get_suggestions: function(term, limit, callback) {
        if(Utils.is_blank(term)) {
            callback([]);
            return;
        }

        let types = [
            Infobox.INFOBOX_TYPES.HISTORY_QUERY,
            Infobox.INFOBOX_TYPES.HISTORY_NAVIGATION
        ];

        // if(this.search_engine.open_url) {
        //     types = [Infobox.INFOBOX_TYPES.HISTORY_NAVIGATION];
        // }

        let search_history = new HistoryManager.SearchHistoryManager();
        let history_suggestions = search_history.get_best_matches({
            text: term,
            min_score: 0.35,
            limit: 3,
            fuzziness: 0.5,
            types: types
        });

        if(history_suggestions.length < 1) {
            callback([]);
        }

        let result = [];

        for(let i = 0; i < history_suggestions.length; i++) {
            let text = history_suggestions[i][1].query;
            let type = history_suggestions[i][1].type;
            let relevance = history_suggestions[i][0];

            let suggestion = {
                text: text,
                type: type,
                relevance: relevance,
                term: term
            }
            result.push(suggestion);
        }

        callback(result.slice(0, limit));
    },

    get_menu_item: function(suggestion_data) {
        let item = new SuggestionsMenuItem(suggestion_data);
        return item;
    }
});