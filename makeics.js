/**
 * Class schedule to .ics file bookmarklet
 * Leo Koppel
 * Based on the script by Keanu Lee (https://github.com/keanulee/ClassScheduleToICS)
 *
 * License: MIT (see LICENSE.md)
 */
 
var ver='0.1';
var frame = parent.TargetContent;
var weekdays_input = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
var num_problem_rows = 0;

// 11:30AM -> 41400
function time_to_seconds(time_str) {
    // time_str can be in the form "2:30PM" or "14:30" -- varies by browser for some reason.
    m = time_str.match(/(\d*):(\d*)(\wM)?/);
    hour = parseInt(m[1]);
    min = parseInt(m[2]);
    if(m[3] == 'PM' && hour < 12) hour += 12;
    return (hour*60 +min)*60;
}

function pad(n) {
      if (n<10) return '0'+n;
      return n;
}

// JS Date -> 20130602T130000
function date_to_string(date) {
     return date.getFullYear()
        +pad( date.getMonth() + 1 )
        +pad( date.getDate() )
        +'T'
        +pad( date.getHours() )
        +pad( date.getMinutes() )
        +pad( date.getSeconds() );
}

function title_case(str)
{
    return str.replace(/\w\S*/g, function(txt){return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();});
}

function create_ics_wrap(events) {
        ics_content = 'BEGIN:VCALENDAR\r\n'
        +"PRODID:-//Leo Koppel//Queen's Soulless Calendar Exporter//EN\r\n"
        +'VERSION:2.0\r\n'
        
        // timezone definition from http://erics-notes.blogspot.ca/2013/05/fixing-ics-time-zone.html
        +'BEGIN:VTIMEZONE\r\n'
        +'TZID:America/New_York\r\n'
        +'X-LIC-LOCATION:America/New_York\r\n'
        +'BEGIN:DAYLIGHT\r\n'
        +'TZOFFSETFROM:-0500\r\n'
        +'TZOFFSETTO:-0400\r\n'
        +'TZNAME:EDT\r\n'
        +'DTSTART:19700308T020000\r\n'
        +'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU\r\n'
        +'END:DAYLIGHT\r\n'
        +'BEGIN:STANDARD\r\n'
        +'TZOFFSETFROM:-0400\r\n'
        +'TZOFFSETTO:-0500\r\n'
        +'TZNAME:EST\r\n'
        +'DTSTART:19701101T020000\r\n'
        +'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU\r\n'
        +'END:STANDARD\r\n'
        +'END:VTIMEZONE\r\n';

        ics_content += events.join('\r\n')
        ics_content += 'END:VCALENDAR\r\n';
        
        return ics_content;

}

// Parse a single row (given as an array of table cell content) and return the ICS string.
// If the row should be ignored return false
function row_to_ics(cells) {
    // Sometimes solus lists extra rows with no date/time (?). Ignore them.
          if(cells[3].trim().length == 0) {
              return false;
          }

          //class_nbr = cells[0]; //ignore
          //section = cells[1]; //ignore
          // if component (lecture or tutorial or lab) is omitted, it is the same as above
          if(cells[2].trim().length > 0) {
              component = cells[2].trim();
          } 
          days_and_times = cells[3].split(' ');
          room = cells[4].trim();
          instructor = cells[5].trim();
          start_and_end = cells[6].split(' - ');

          input_weekday = days_and_times[0].trim(); // e.g. 'Mo'
          input_start_time = days_and_times[1].trim(); // e.g. '8:30AM'
          // days_and_times[2] is '-'
          input_end_time = days_and_times[3].trim(); // e.g. '9:30AM'     
          range_start_date = new Date(Date.parse(start_and_end[0]));
          
          // annoyingly, UNTIL must be given in UTC time
          // even then,, there were odd issues with calendars ending recurring events a day earlier
          // this quick fix just to adds a day.
          range_end_date = new Date(Date.parse(start_and_end[1]));
          range_end_date.setTime(range_end_date.getTime() + 24*(60*60*1000));
          
                    
          // Now we need to get the actual date of the class.
          // This is not trivial as "start_day" could be before this - probably the monday of that week, but not for sure
          // We have, e.g. "Mo 11:30AM - 12:30PM" from which we can get day of week and we know it is after range_start_date.
          // JS days start at 0 for Sunday, and so does weekdays_input
          start_day = weekdays_input.indexOf(input_weekday);
          if(start_day == -1) {
              throw 'Unexpected weekday format: ' + weekdays_input;
          }
          range_start_day = range_start_date.getDay();
          incr = (7-range_start_day+start_day)%7;
          
          // The real event start and end dates. Assume no class runs through midnight.
          start_date = new Date(range_start_date.getTime() + incr*(24*60*60*1000) + time_to_seconds(input_start_time)*1000);
          end_date = new Date(range_start_date.getTime() + incr*(24*60*60*1000) + time_to_seconds(input_end_time)*1000);
          
          return ('BEGIN:VEVENT\r\n'
          +'DTSTART;TZID=America/New_York:' + date_to_string(start_date) + '\r\n'
          +'DTEND;TZID=America/New_York:' + date_to_string(end_date) + '\r\n'
          +'SUMMARY:' + course_code + ' ' + component + '\r\n'
          +'LOCATION:' + title_case(room) + '\r\n'
          +'DESCRIPTION:' + course_code + ' - ' + course_name + ' ' + component + '. ' + instructor + '\r\n'
          +'RRULE:FREQ=WEEKLY;UNTIL=' + date_to_string(range_end_date) + 'Z' + '\r\n'
          +'END:VEVENT\r\n');
    
}

function create_ics() {
    var ics_events = [];
    if(frame.$('.PSGROUPBOXWBO').length == 0) {
        throw "Course tables not found.";
    }

    // for each course
    frame.$('.PSGROUPBOXWBO:gt(0)').each(function() { 
        _course_title_parts = frame.$(this).find('td:eq(0)').text().split(' - ');
        course_code = _course_title_parts[0].trim();
        course_name = _course_title_parts[1].trim();
       
       var component = '';
       
       // for each event
       frame.$(this).find("tr:gt(7)").each(function() {
          var cells = frame.$(this).find('td').map(function() { return frame.$(this).text(); });
          try {
            var event_string = row_to_ics(cells);
            console.log(cells);
            if (event_string) {
                // now append to the ics string
                ics_events.push(event_string);
                frame.$(this).find('td').css('background', '#ebffeb'); // mark in light green
            }
          }
          catch(err) {
            // add the row to the 'could not parse' count and highlight it
            num_problem_rows += 1;
            frame.$(this).find('td').css('background', 'red');
          }

       }); // end each event
        
    }); // end each course
    
    if(ics_events.length == 0) {
        throw "No class entries found.";
    }
    
    return create_ics_wrap(ics_events);
}

        
function initBookmarklet() {

        frame.$.getScript('https://googledrive.com/host/0B4PDwhAa-jNITkc4MTh5M1BoZG8/filesaver.js');

        if(parent.TargetContent.location.pathname.indexOf('SSR_SSENRL_LIST.GBL') == -1) {
            throw "List view not found.";
        }
        
        ics_content = create_ics();
                        
        frame.$('#ics_download').remove();
        
        frame.$('.PATRANSACTIONTITLE').append(' <span id="ics_download">('
        +'<a href="#" id="ics_download_link">Download .ics file</a>'
        +')</span>');

        frame.$('#ics_download_link').click( function() {
            var blob = new Blob([ics_content], {type: "text/plain;charset=utf-8"});
            frame.saveAs(blob, "coursecalendar.ics");
            return false;
        });
        
        if(num_problem_rows > 0) {
            alert('ICS file was created, but I could not understand '
            + num_problem_rows + ' '
            + (num_problem_rows > 1 ? 'rows. These are' : 'row. This is')
            + ' highlighted in red.');
        }
}


(function(){
    
    try {
    // the minimum version of jQuery we want
    var jquery_ver = "1.10.0";
   
        if (frame === undefined) {
            throw "TargetContent frame not found.";
        }
    
        // check prior inclusion and version
        if (frame.jQuery === undefined || frame.jQuery.fn.jquery < jquery_ver) {
            var done = false;
            var script = frame.document.createElement("script");
            script.src = "https://ajax.googleapis.com/ajax/libs/jquery/" + jquery_ver + "/jquery.min.js";
            script.onload = script.onreadystatechange = function(){
                if (!done && (!this.readyState || this.readyState == "loaded" || this.readyState == "complete")) {
                    done = true;
                    initBookmarklet();
                }
            };
            frame.document.getElementsByTagName("head")[0].appendChild(script);
        } else {
            initBookmarklet();
        }
     }    
    catch(err){
        var msg="Schedule exporter didn't work :(\n"
        +"Make sure you are on the \"List View\" of \" My Class Schedule\".\n\n"
        +"Otherwise, report this: \n"
        +'v' + ver + '\n'
        +err + '\n';
        
        for (var x in frame.$.browser) {
            msg += x +' ' + frame.$.browser[x] + '\n';
        }
        alert(msg);
    }
})();
