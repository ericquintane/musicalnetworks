# musicalnetworks: helpers for piping relational event data from R into the
# web app at https://ericquintane.github.io/musicalnetworks/
#
# The app reads a CSV with columns: time, sender, receiver, optional type and
# weight. Times can be on any numeric scale; the app rescales to the chosen
# musical duration. Sender and receiver are character ids.

#' Write a relational event sequence to a CSV the app can read.
#'
#' @param events A data.frame of relational events.
#' @param file Output CSV path.
#' @param time Name of the time column. Default "time".
#' @param sender Name of the sender column. Default "sender".
#' @param receiver Name of the receiver column. Default "receiver".
#' @param type Optional name of the event type column. Default "type".
#' @param weight Optional name of the weight column. Default "weight".
#'
#' @return Invisibly returns the file path.
#'
#' @examples
#' \dontrun{
#'   set.seed(1)
#'   ev <- data.frame(
#'     time     = sort(runif(60, 0, 30)),
#'     sender   = sample(letters[1:6], 60, replace = TRUE),
#'     receiver = sample(letters[1:6], 60, replace = TRUE),
#'     type     = sample(c("email", "meeting"), 60, replace = TRUE)
#'   )
#'   ev <- ev[ev$sender != ev$receiver, ]
#'   write_rem_csv(ev, "events.csv")
#' }
write_rem_csv <- function(events,
                          file,
                          time     = "time",
                          sender   = "sender",
                          receiver = "receiver",
                          type     = "type",
                          weight   = "weight") {
  stopifnot(is.data.frame(events))
  required <- c(time, sender, receiver)
  missing  <- setdiff(required, names(events))
  if (length(missing)) {
    stop("Missing required columns: ", paste(missing, collapse = ", "))
  }

  out <- data.frame(
    time     = as.numeric(events[[time]]),
    sender   = as.character(events[[sender]]),
    receiver = as.character(events[[receiver]]),
    stringsAsFactors = FALSE
  )
  if (type   %in% names(events)) out$type   <- as.character(events[[type]])
  if (weight %in% names(events)) out$weight <- as.numeric(events[[weight]])

  out <- out[!is.na(out$time) & out$sender != out$receiver, ]
  out <- out[order(out$time), ]

  utils::write.csv(out, file, row.names = FALSE)
  message("Wrote ", nrow(out), " events to ", file)
  invisible(file)
}

#' Convert a relevent::rem.dyad-style edgelist to the app's CSV format.
#'
#' Expects a data.frame with columns time, source, target (the standard
#' relevent edgelist layout). Optional ptype column maps to type.
#'
#' @param edgelist data.frame as accepted by relevent::rem.dyad.
#' @param file Output CSV path.
#' @param actor_names Optional character vector of actor names. If supplied,
#'   integer source/target ids are replaced with these names.
write_relevent_csv <- function(edgelist, file, actor_names = NULL) {
  stopifnot(is.data.frame(edgelist))
  needed <- c("time", "source", "target")
  if (!all(needed %in% names(edgelist))) {
    stop("relevent edgelist must have columns: time, source, target.")
  }

  ev <- data.frame(
    time     = as.numeric(edgelist$time),
    sender   = edgelist$source,
    receiver = edgelist$target,
    stringsAsFactors = FALSE
  )
  if ("ptype" %in% names(edgelist)) ev$type <- edgelist$ptype

  if (!is.null(actor_names)) {
    ev$sender   <- actor_names[ev$sender]
    ev$receiver <- actor_names[ev$receiver]
  } else {
    ev$sender   <- as.character(ev$sender)
    ev$receiver <- as.character(ev$receiver)
  }

  write_rem_csv(ev, file)
}
