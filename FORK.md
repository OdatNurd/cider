# Cider Fork

This branch is a fork of the `main` branch of `cider`, implementing some new
features and changes into it; largely these are related to the simulator, but
some application related changes are in place as well.

The intent of this document is to indicate the changes made in each commit to
both act as a growing document of the changes, with more detail than the commit
messages can or should contain, and to track what the changes are to make any
eventual merges less painful.

In this initial fork, the `.gitignore` was updated so that I can keep my
Sublime Text project file in the folder without being annoyed, as well as
committing the current package-lock.json file because it looks like it was
accidentally dropped from the commit on the last release cut.


# Features and Changes

## Main Application

The `main.ts` was updated so that as long as the app is running as a compiled
and bundled Electron application, the menu on the window is removed, but it is
left in place when running via `npm` since otherwise the internal dev tools are
not available.

In addition, as a Slackware user `deb` files are not as useful (although they
can be turned into packages), so the Electron builder for Linux was extended to
also generate a Tarball.

## Welcome Screen

While playing with the application and trying things the list of projects on the
welcome screen started to pile up and there is no good way that I could see that
this can be cleared without manual intervention or removal of projects that may
still be desirable top keep around.

So, here the tiles that represent the projects that are known to the system each
have a close button that can be used to cause the app to forget them without
removing the files.

This leaves the localStorage for the tree alone; this would get cleaned up when
the app next starts, but if you re-open a project from the same path it was at
previously without quitting, its tree will retain its state.

## Project Tree

The project tree in the sidebar can get a little busy with a lot of assets,
particularly when they are structured into folders. With more than one deck of
cards it is also a little busy in the sidebar.

So as a bit of a UX improvement, events are caught in the sidebar to indicate
when a node is being expanded or collapsed, and that state information is
written to local storage using a key that derives from the project path. This
is then used to restore that state when the tree is recreated on package
reload.

As a safety measure, when starting up we scan over all of the localStorage keys
that represent tree data and verify if the path to those files is still present
or not, and if not, remove that key, just to stop storage bloat.

## Documents

Something that caught me by surprise since it is not mentioned in the
documentation and a bit hard to find is that it is possible to include Markdown
files in the project and view them in a rendered state.

An interesting feature experiment here is augmenting this so that the
`{{assett}}` handlebar is supported here, specifically to allow you to get at
the URL for images (though it would work for everything). This would allow you
to inject your custom card icons into your notes, for example.

Here we add that by a little bit of regex trickery, allowing the loaded asset
URL to be injected in for any matches.

## Game Simulator

### Bug Fixes

- The state of the simulator that you get when you open it initially is not the
  same as the state that you get when you use the reset option. This seems to be
  because the initial state is not calculated the same way as a reset is.

  For the sake of repeatability and consistency, settle on a single layout; the
  one selected is the one that looked the most visually pleasing to my eye,
  though this could certainly be done better.

- The middle mouse button allows you to zoom in on the hovered card so you can
  see it better. However the middle button is also a shortcut to panning in the
  simulator area.

  As such, it was possible to accidentally pan while trying to look at a card,
  which is problematic if you have a complex layout since it may disrupt disrupt
  what you can see.

- The boolean flag that indicates that a non-card/non-stack component (e.g. a
  pawn, a die, etc) is being dragged existed but was never actually updated from
  its initial value.

- Stop context menus from opening when you press the right mouse button while a
  drag operation is in progress. While technically harmless it is visually
  distracting.

- The code for opening a context menu was triggering errors in the console
  because it was synthesizing an Event object to pass to the underlying library,
  but that library tries to suppress the event by invoking a method on it that
  the stub object does not contain.

  This is harmless, but adds annoying spam to the console in the dev tools. So
  this has been redacted in favor of just passing the event directly. I'm not
  sure if there was some other reason for doing it this way that this may be
  subverting.

### Enhancements

- Middle-click on a stack now zooms the stack, so that it is easier to read a
  card from the top of a stack without having to draw it first.

- The simulator now tracks whether or not the mouse enters or leaves an item on
  the field (card, stack, etc) so that it is possible to carry out actions on
  the currently "selected" item.

  As a part of this, we must be careful when allowing drops because the original
  code assumes that if there is a hovered item, it is a stack. Now we must be
  careful to check that a drop target is a stack, or else dropping a card onto
  another card or component will erase it, since it's removed from the field but
  not added anywhere else.

- With the simulator able to track the component currently under the mouse, it
  is possible to include key bindings to flip/rotate/discard the item under the
  cursor, rather than having to always do it from the menu. Additionally it is
  now possible to draw cards via a key if a stack is hovered.

  This is implemented to apply the controls to everything that can be controlled
  via a context menu in this manner (so you cannot "discard" a token, but you
  can discard a card).

  Note that as defined the `shift` key, in combination with the button that
  appears when you hover over a card, would draw face down; this has been
  augmented to also work with `ctrl` as well.

  The shortcut popup is also augmented to show these keys.

- Stacks have been given a new internal state, `transient`; such a stack acts in
  all ways as a stack always has, but the transient state allows for marking a
  stack as one that is intended to be temporary.

  When the last card is taken out of a transient stack, the stack itself is
  deleted. Alternately, if the second to last card is taken out, then the stack
  is deleted and replaced by the single card still left within it. This covers
  the case of odd and even numbered cards in the stack.

  Operations that split stacks apart (by name, by attribute) create transient
  stacks, allowing you to pull cards out of existing stacks without making a new
  permanent one.

  When a new stack is created due to an operation on an existing stack, the new
  stack inherits the transient state of its parent.

  This currently has a display issue because stacks are hard coded to display in
  a specific way irrespective of their content.

- A natural behaviour when playing with cards is the idea of stacking arbitrary
  cards together, such as putting one card on top of another, or tucked under,
  etc. This is what stacks are, but creating a stack manually to do this is a
  bit of a pain point.

  Dropping a card onto another single card while holding the `shift` key causes
  the target card to be promoted into a stack directly. This is done with the
  addition of a modifier as otherwise you can't lay cards near each other
  without stacking them. Stacks created this way are created as `transient` so
  they go away when you empty them.
