const St = imports.gi.St;
const Lang = imports.lang;

const Extension = imports.misc.extensionUtils.get_web_search_dialog_extension();
const SuggestionsBase = Extension.imports.suggestions_base;
const Utils = Extension.imports.utils;
const infobox = Extension.imports.infobox;

const SUGGESTIONS_NAME = 'GoogleSuggestions';
const SUGGESTIONS_URL =
    "https://suggestqueries.google.com/complete/search?client=chrome&q={term}";

const SuggestionsMenuItem = Lang.Class({
    Name: 'GoogleSuggestionsMenuItem',
    Extends: SuggestionsBase.SuggestionMenuItemBase, 

    _init: function(suggestion_data, params) {
        this.parent(suggestion_data, params);
    }
});

const Suggestions = new Lang.Class({
    Name: 'GoogleSuggestions',
    Extends: SuggestionsBase.SuggestionsBase,

    _init: function() {
        this.parent(SUGGESTIONS_NAME, SUGGESTIONS_URL);
    },

    parse_suggestions: function(suggestions_source, term) {
        if(Utils.is_blank(term)) return [];

        let parsed_json;

        try {
            parsed_json = JSON.parse(suggestions_source);
        }
        catch(e) {
            log("Can't parse suggestions. "+e);
            return [];
        }

        if(parsed_json[1].length < 1) return [];

        let result = [];

        for(let i = 0; i < parsed_json[1].length; i++) {
            let text = parsed_json[1][i].trim();
            let relevance = parseInt(
                parsed_json[4]['google:suggestrelevance'][i]
            );
            let source_type = parsed_json[4]['google:suggesttype'][i].trim();
            let type;

            if(source_type === 'NAVIGATION') {
                type = infobox.INFOBOX_TYPES.SUGGESTIONS_NAVIGATION;
            }
            else if(source_type === 'QUERY') {
                type = infobox.INFOBOX_TYPES.SUGGESTIONS_QUERY;
            }
            else {
                type = false;
            }

            if(Utils.is_blank(text)) continue;
            if(!type) continue;
            if(relevance < 1) continue;

            let suggestion = {
                text: text,
                type: type,
                relevance: relevance,
                term: term
            }
            result.push(suggestion);
        }

        return result;
    },

    get_menu_item: function(suggestion_data) {
        let item = new SuggestionsMenuItem(suggestion_data);
        return item;
    }
});