const St = imports.gi.St;
const Lang = imports.lang;
const Params = imports.misc.params;

const Extension = imports.misc.extensionUtils.get_web_search_dialog_extension();
const SuggestionsBase = Extension.imports.suggestions_base;
const Utils = Extension.imports.utils;
const Infobox = Extension.imports.infobox;

const SUGGESTIONS_NAME = 'ImdbSuggestions';

const SuggestionsMenuItem = new Lang.Class({
    Name: 'ImdbSuggestionsMenuItem',
    Extends: SuggestionsBase.SuggestionMenuItemBase,

    _init: function(suggestion_data, params) {
        this.parent(suggestion_data, params);
    },

    make_actor: function(suggestion_data) {
        this.text = suggestion_data.text;
        this.sub_text = suggestion_data.sub;
        this.type = suggestion_data.type;
        this.relevance = suggestion_data.relevance;
        this.term = suggestion_data.term;
        this.url = suggestion_data.url;

        this.label_text = '<span><b>'+this.text+'</b></span>';
        if(suggestion_data.year > 0) {
            this.label_text += '<span> ('+suggestion_data.year+')</span>';
        }
        this.label_text +=
            '\n<span size="xx-small" color="grey">'+this.sub_text+'</span>';
        if(suggestion_data.movie == true) {
            this.label_text +=
                '\n<span size="xx-small" color="grey"><i>Movie</i></span>';
        }
        if(suggestion_data.series == true) {
            this.label_text +=
                '\n<span size="xx-small" color="grey"><i>TV series</i></span>';
        }

        this.label = new St.Label({
            style_class: 'suggestions-text',
            text: this.label_text
        });
        this.label.clutter_text.use_markup = true;

        let icon_people = {
            url: "http://i.media-imdb.com/images/mobile/people-40x54.png",
            width: 40,
            height: 54
        };
        let icon_film = {
            url: "http://i.media-imdb.com/images/mobile/film-40x54.png",
            width: 40,
            height: 54
        };

        this.icon;

        if(!suggestion_data.icon_info) {
            if(suggestion_data.movie == true || suggestion_data.series == true) {
                this.icon = this.get_icon(icon_film);
            }
            else {
                this.icon = this.get_icon(icon_people)
            }
        }
        else {
            this.icon = this.get_icon(suggestion_data.icon_info);
        }

        let box = new St.BoxLayout();
        box.add(this.icon);
        box.add(this.label);

        this.addActor(box);
        this.actor.label_actor = this.label;
    },

    highlight_text: function(term) {
        return this.label_text;
    }
});

const Suggestions = new Lang.Class({
    Name: 'ImdbSuggestions',
    Extends: SuggestionsBase.SuggestionsBase,

    _init: function() {
        let url = "http://sg.media-imdb.com/suggests/{first_char}/{term}.json";
        this.parent(SUGGESTIONS_NAME, url);
    },

    _make_url: function(term) {
        if(Utils.is_blank(this._url) || this._url.indexOf('{term}') === -1) {
            throw new Error('Invalid suggestions engine url.');
            return false;
        }

        let result = false;

        if(!Utils.is_blank(term)) {
            term = term.trim();
            term = term.replace(' ', '_');
            result = this._url.replace('{first_char}', term[0].toLowerCase());
            result = result.replace('{term}', encodeURIComponent(term.toLowerCase()));
        }

        return result;
    },

    _parse_icon_info: function(icon_info) {
        let url = icon_info[0].slice(0, -4)+'_SX40_CR0,0,40,54_'+'.jpg';
        let width = icon_info[1];
        let height = icon_info[2];
        let result = {
            url: url,
            width: 40,
            height: 54
        };

        return result;
    },

    parse_suggestions: function(suggestions_source, term) {
        let result = [];
        let base_url = 'http://www.imdb.com';

        if(suggestions_source.length < 1) return result;

        let start_index = suggestions_source.indexOf("(") + 1;
        let end_index = suggestions_source.lastIndexOf(")");
        let json_data = suggestions_source.substring(start_index, end_index);

        let parsed_json = JSON.parse(json_data);

        if(parsed_json['d'].length > 0) {
            for(let i = 0; i < parsed_json['d'].length; i++) {
                let temp = parsed_json['d'][i];
                let text = temp['l'];
                let sub = temp['s'];
                let id = temp['id'];
                let year = temp['y'] !== undefined ? temp['y'] : 0;
                let movie = temp['q'] == 'feature' ? true : false;
                let series = temp['q'] == 'TV series' ? true : false;
                let icon =
                    temp['i'] !== undefined
                    ? this._parse_icon_info(temp['i'])
                    : false;
                let relevance = 0;
                let type = Infobox.INFOBOX_TYPES.SUGGESTIONS_NAVIGATION;
                let url;

                if(id.indexOf('nm') !== -1) {
                    url = base_url+'/name/'+id;
                }
                else if(id.indexOf('tt') !== -1) {
                    url = base_url+'/title/'+id;
                }
                else {
                    url = base_url;
                }

                if(Utils.is_blank(sub)) continue;

                let suggestion = {
                    text: text,
                    sub: sub,
                    year: year,
                    id: id,
                    url: url,
                    icon_info: icon,
                    movie: movie,
                    series: series,
                    type: type,
                    relevance: relevance,
                    term: term
                }
                result.push(suggestion);
            }
        }

        return result;
    },

    get_menu_item: function(suggestion_data) {
        let item = new SuggestionsMenuItem(suggestion_data);
        return item;
    }
});
