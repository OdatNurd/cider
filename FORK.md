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
