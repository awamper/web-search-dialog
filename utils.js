/* -*- mode: js; js-basic-offset: 4; indent-tabs-mode: nil -*- */

/*
 * Part of this file comes from gnome-shell-extensions:
 * http://git.gnome.org/browse/gnome-shell-extensions/
 * 
 */


const Gettext = imports.gettext;
const Gio = imports.gi.Gio;
const Lang = imports.lang;
const Params = imports.misc.params;
const Config = imports.misc.config;
const ExtensionUtils = imports.misc.extensionUtils;
const Soup = imports.gi.Soup;
const Clutter = imports.gi.Clutter;

const _httpSession = new Soup.SessionAsync();
Soup.Session.prototype.add_feature.call(
    _httpSession,
    new Soup.ProxyResolverDefault()
);
_httpSession.user_agent = 'Gnome-Shell WebSearchDialog Extension';
_httpSession.timeout = 1;

const ICONS = {
    information: 'dialog-information-symbolic',
    error: 'dialog-error-symbolic',
    find: 'edit-find-symbolic',
    web: 'web-browser-symbolic'
};


const KEYBOARD_NUMBERS = [
    Clutter.KEY_0,
    Clutter.KEY_1,
    Clutter.KEY_2,
    Clutter.KEY_3,
    Clutter.KEY_4,
    Clutter.KEY_5,
    Clutter.KEY_6,
    Clutter.KEY_7,
    Clutter.KEY_8,
    Clutter.KEY_9,
];

/**
 * getSettings:
 * @schema: (optional): the GSettings schema id
 *
 * Builds and return a GSettings schema for @schema, using schema files
 * in extensionsdir/schemas. If @schema is not provided, it is taken from
 * metadata['settings-schema'].
 */
function getSettings(schema) {
    let extension = ExtensionUtils.getCurrentExtension();

    schema = schema || extension.metadata['settings-schema'];

    const GioSSS = Gio.SettingsSchemaSource;

    // check if this extension was built with "make zip-file", and thus
    // has the schema files in a subfolder
    // otherwise assume that extension has been installed in the
    // same prefix as gnome-shell (and therefore schemas are available
    // in the standard folders)
    let schemaDir = extension.dir.get_child('schemas');
    let schemaSource;
    if (schemaDir.query_exists(null))
        schemaSource = GioSSS.new_from_directory(schemaDir.get_path(),
                                                 GioSSS.get_default(),
                                                 false);
    else
        schemaSource = GioSSS.get_default();

    let schemaObj = schemaSource.lookup(schema, true);
    if (!schemaObj)
        throw new Error('Schema ' + schema + ' could not be found for extension '
                        + extension.metadata.uuid + '. Please check your installation.');

    return new Gio.Settings({ settings_schema: schemaObj });
}

function is_blank(str) {
    return (!str || /^\s*$/.test(str));
}

function starts_with(str1, str2) {
    return str1.slice(0, str2.length) == str2;
}

// Helper function to translate launch parameters into a GAppLaunchContext
function _makeLaunchContext(params) {
    params = Params.parse(params, {
        workspace: -1,
        timestamp: 0
    });

    let launchContext = global.create_app_launch_context();
    if (params.workspace != -1)
        launchContext.set_desktop(params.workspace);
    if (params.timestamp != 0)
        launchContext.set_timestamp(params.timestamp);

    return launchContext;
}

function escape_html(unsafe) {
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
 }

function is_matches_protocol(text) {
    text = text.trim();
    let http = starts_with(text, 'http://'.slice(0, text.length));
    let https = starts_with(text, 'https://'.slice(0, text.length));

    if(http || https) {
        return true;
    }
    else {
        return false;
    }
}

function get_url(text) {
    let url_regexp = imports.misc.util._urlRegexp;
    let url = parseUri(text);
    let test_url = '';

    if(is_blank(url.protocol)) {
        test_url = 'http://'+url.source;
    }
    else {
        test_url = url.source;
    }

    if(!test_url.match(url_regexp)) {
        return false;
    }
    else {
        return test_url;
    }
}

// parseUri 1.2.2
// (c) Steven Levithan <stevenlevithan.com>
// MIT License

function parseUri (str) {
  var o   = parseUri.options,
    m   = o.parser[o.strictMode ? "strict" : "loose"].exec(str),
    uri = {},
    i   = 14;

  while (i--) uri[o.key[i]] = m[i] || "";

  uri[o.q.name] = {};
  uri[o.key[12]].replace(o.q.parser, function ($0, $1, $2) {
    if ($1) uri[o.q.name][$1] = $2;
  });

  return uri;
};

parseUri.options = {
  strictMode: false,
  key: ["source","protocol","authority","userInfo","user","password","host","port","relative","path","directory","file","query","anchor"],
  q:   {
    name:   "queryKey",
    parser: /(?:^|&)([^&=]*)=?([^&]*)/g
  },
  parser: {
    strict: /^(?:([^:\/?#]+):)?(?:\/\/((?:(([^:@]*)(?::([^:@]*))?)?@)?([^:\/?#]*)(?::(\d*))?))?((((?:[^?#\/]*\/)*)([^?#]*))(?:\?([^#]*))?(?:#(.*))?)/,
    loose:  /^(?:(?![^:@]+:[^:@\/]*@)([^:\/?#.]+):)?(?:\/\/)?((?:(([^:@]*)(?::([^:@]*))?)?@)?([^:\/?#]*)(?::(\d*))?)(((\/(?:[^?#](?![^?#\/]*\.[^?#\/.]+(?:[?#]|$)))*\/?)?([^?#\/]*))(?:\?([^#]*))?(?:#(.*))?)/
  }
};

/*!
 * string_score.js: String Scoring Algorithm 0.1.10 
 *
 * http://joshaven.com/string_score
 * https://github.com/joshaven/string_score
 *
 * Copyright (C) 2009-2011 Joshaven Potter <yourtech@gmail.com>
 * Special thanks to all of the contributors listed here https://github.com/joshaven/string_score
 * MIT license: http://www.opensource.org/licenses/mit-license.php
 *
 * Date: Tue Mar 1 2011
*/

/**
 * Scores a string against another string.
 *  'Hello World'.score('he');     //=> 0.5931818181818181
 *  'Hello World'.score('Hello');  //=> 0.7318181818181818
 */
function string_score(string, abbreviation, fuzziness) {
  // If the string is equal to the abbreviation, perfect match.
  if (string == abbreviation) {return 1;}
  //if it's not a perfect match and is empty return 0
  if(abbreviation == "" || string == "") {return 0;}

  var total_character_score = 0,
      abbreviation_length = abbreviation.length,
      string_length = string.length,
      start_of_string_bonus,
      abbreviation_score,
      fuzzies=1,
      final_score;
  
  // Walk through abbreviation and add up scores.
  for (var i = 0,
         character_score/* = 0*/,
         index_in_string/* = 0*/,
         c/* = ''*/,
         index_c_lowercase/* = 0*/,
         index_c_uppercase/* = 0*/,
         min_index/* = 0*/;
     i < abbreviation_length;
     ++i) {
    
    // Find the first case-insensitive match of a character.
    c = abbreviation.charAt(i);
    
    index_c_lowercase = string.indexOf(c.toLowerCase());
    index_c_uppercase = string.indexOf(c.toUpperCase());
    min_index = Math.min(index_c_lowercase, index_c_uppercase);
    index_in_string = (min_index > -1) ? min_index : Math.max(index_c_lowercase, index_c_uppercase);
    
    if (index_in_string === -1) { 
      if (fuzziness) {
        fuzzies += 1-fuzziness;
        continue;
      } else {
        return 0;
      }
    } else {
      character_score = 0.1;
    }
    
    // Set base score for matching 'c'.
    
    // Same case bonus.
    if (string[index_in_string] === c) { 
      character_score += 0.1; 
    }
    
    // Consecutive letter & start-of-string Bonus
    if (index_in_string === 0) {
      // Increase the score when matching first character of the remainder of the string
      character_score += 0.6;
      if (i === 0) {
        // If match is the first character of the string
        // & the first character of abbreviation, add a
        // start-of-string match bonus.
        start_of_string_bonus = 1 //true;
      }
    }
    else {
  // Acronym Bonus
  // Weighing Logic: Typing the first character of an acronym is as if you
  // preceded it with two perfect character matches.
  if (string.charAt(index_in_string - 1) === ' ') {
    character_score += 0.8; // * Math.min(index_in_string, 5); // Cap bonus at 0.4 * 5
  }
    }
    
    // Left trim the already matched part of the string
    // (forces sequential matching).
    string = string.substring(index_in_string + 1, string_length);
    
    total_character_score += character_score;
  } // end of for loop
  
  // Uncomment to weigh smaller words higher.
  // return total_character_score / string_length;
  
  abbreviation_score = total_character_score / abbreviation_length;
  //percentage_of_matched_string = abbreviation_length / string_length;
  //word_score = abbreviation_score * percentage_of_matched_string;
  
  // Reduce penalty for longer strings.
  //final_score = (word_score + abbreviation_score) / 2;
  final_score = ((abbreviation_score * (abbreviation_length / string_length)) + abbreviation_score) / 2;
  
  final_score = final_score / fuzzies;
  
  if (start_of_string_bonus && (final_score + 0.15 < 1)) {
    final_score += 0.15;
  }
  
  return final_score;
};

function wordwrap(str, width, brk, cut) {
 
    brk = brk || '\n';
    width = width || 75;
    cut = cut || false;
 
    if (!str) { return str; }
 
    var regex = '.{1,' +width+ '}(\\s|$)' + (cut ? '|.{' +width+ '}|.+$' : '|\\S+?(\\s|$)');
 
    return str.match( RegExp(regex, 'g') ).join( brk );
 
}